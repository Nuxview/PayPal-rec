BEGIN;

-- Fail if the supplied write succeeds or raises a different kind of error.
CREATE FUNCTION pg_temp.expect_sqlstate(command text, expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE command;
    RAISE EXCEPTION 'Expected SQLSTATE % for %', expected, command;
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected THEN
        RAISE;
    END IF;
END;
$$;

DO $$
DECLARE
    agency_case uuid;
    other_case uuid;
    finding uuid;
    other_finding uuid;
    review_time timestamptz := now();
BEGIN
    INSERT INTO reconstruction_cases (merchant_key, case_label)
        VALUES ('demo-merchant', 'Agency') RETURNING case_id INTO agency_case;
    INSERT INTO reconstruction_cases (merchant_key, case_label)
        VALUES ('other-merchant', 'Other case') RETURNING case_id INTO other_case;

    INSERT INTO evidence_sources
        (case_id, source_id, source_kind, source_origin, source_name, source_content)
    VALUES
        (agency_case, 'SRC-01', 'notice', 'synthetic_replay', 'notice.txt', 'Provide proof of delivery.'),
        (agency_case, 'SRC-02', 'payment', 'synthetic_replay', 'payment.json', '{"amount":"2400.00"}'),
        (other_case, 'SRC-01', 'notice', 'synthetic_replay', 'other-notice.txt', 'Different case.'),
        (other_case, 'SRC-03', 'invoice', 'synthetic_replay', 'other-invoice.txt', 'Different invoice.');

    INSERT INTO reconstruction_findings (case_id, request_label, statement, assessment)
        VALUES (agency_case, 'R3', 'No receipt was supplied.', 'missing_evidence')
        RETURNING finding_id INTO finding;
    INSERT INTO reconstruction_findings (case_id, statement, assessment)
        VALUES (other_case, 'Independent claim.', 'supported')
        RETURNING finding_id INTO other_finding;

    INSERT INTO finding_citations (case_id, finding_id, source_id, start_line, end_line)
        VALUES (agency_case, finding, 'SRC-01', 1, 1);
    INSERT INTO finding_citations (case_id, finding_id, source_id, json_pointer)
        VALUES (agency_case, finding, 'SRC-02', '/amount');

    IF NOT EXISTS (SELECT 1 FROM reconstruction_findings
                   WHERE case_id = agency_case AND finding_id = finding AND review_state = 'pending') THEN
        RAISE EXCEPTION 'New findings must await review';
    END IF;

    PERFORM pg_temp.expect_sqlstate(format(
        'UPDATE reconstruction_findings SET review_state = %L WHERE case_id = %L AND finding_id = %L',
        'accepted', agency_case, finding), '23514');

    UPDATE reconstruction_findings SET
        review_state = 'accepted', reviewer_key = 'demo-reviewer', reviewed_at = review_time
    WHERE case_id = agency_case AND finding_id = finding;

    IF NOT EXISTS (SELECT 1 FROM reconstruction_findings
                   WHERE case_id = agency_case AND finding_id = finding
                     AND review_state = 'accepted' AND reviewer_key = 'demo-reviewer'
                     AND reviewed_at = review_time AND assessment = 'missing_evidence') THEN
        RAISE EXCEPTION 'Review must persist without changing the assessment';
    END IF;

    PERFORM pg_temp.expect_sqlstate(
        'INSERT INTO evidence_sources (case_id, source_id, source_kind, source_origin, source_name, source_content)
         VALUES (gen_random_uuid(), ''SRC-99'', ''notice'', ''synthetic_replay'', ''orphan.txt'', ''Orphan'')',
        '23503');
    PERFORM pg_temp.expect_sqlstate(
        'INSERT INTO reconstruction_findings (case_id, statement, assessment)
         VALUES (gen_random_uuid(), ''Orphan claim'', ''supported'')', '23503');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, json_pointer)
         VALUES (%L, %L, %L, %L)', agency_case, finding, 'SRC-99', '/amount'), '23503');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, start_line, end_line)
         VALUES (%L, %L, %L, 1, 1)', agency_case, finding, 'SRC-03'), '23503');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, start_line, end_line)
         VALUES (%L, %L, %L, 1, 1)', agency_case, other_finding, 'SRC-01'), '23503');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, start_line, end_line)
         VALUES (%L, %L, %L, 0, 1)', agency_case, finding, 'SRC-01'), '23514');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, start_line, end_line, json_pointer)
         VALUES (%L, %L, %L, 1, 1, %L)', agency_case, finding, 'SRC-01', '/amount'), '23514');
    PERFORM pg_temp.expect_sqlstate(format(
        'INSERT INTO finding_citations (case_id, finding_id, source_id, json_pointer)
         VALUES (%L, %L, %L, %L)', agency_case, finding, 'SRC-02', '/bad~2escape'), '23514');
    PERFORM pg_temp.expect_sqlstate(format(
        'DELETE FROM evidence_sources WHERE case_id = %L AND source_id = %L', agency_case, 'SRC-02'),
        '23503');

    SET CONSTRAINTS citation_source_fk DEFERRED;
    DELETE FROM reconstruction_cases WHERE case_id = agency_case AND merchant_key = 'demo-merchant';
    SET CONSTRAINTS citation_source_fk IMMEDIATE;
    IF EXISTS (SELECT 1 FROM evidence_sources WHERE case_id = agency_case)
        OR EXISTS (SELECT 1 FROM reconstruction_findings WHERE case_id = agency_case)
        OR EXISTS (SELECT 1 FROM finding_citations WHERE case_id = agency_case)
        OR NOT EXISTS (SELECT 1 FROM evidence_sources WHERE case_id = other_case AND source_id = 'SRC-01')
        OR NOT EXISTS (SELECT 1 FROM reconstruction_findings WHERE case_id = other_case AND finding_id = other_finding) THEN
        RAISE EXCEPTION 'Case deletion must remove its own rows and preserve the other case';
    END IF;
END;
$$;

ROLLBACK;
