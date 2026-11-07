BEGIN;

CREATE TABLE reconstruction_cases (
    case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_key text NOT NULL CHECK (btrim(merchant_key) <> ''),
    case_label text NOT NULL CHECK (btrim(case_label) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_sources (
    case_id uuid NOT NULL REFERENCES reconstruction_cases (case_id) ON DELETE CASCADE,
    source_id text NOT NULL CHECK (btrim(source_id) <> ''),
    source_kind text NOT NULL CHECK (btrim(source_kind) <> ''),
    source_origin text NOT NULL CHECK (source_origin IN (
        'merchant_provided', 'paypal_sandbox', 'synthetic_replay'
    )),
    source_name text NOT NULL CHECK (btrim(source_name) <> ''),
    source_content text NOT NULL CHECK (source_content <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, source_id)
);

CREATE TABLE reconstruction_findings (
    case_id uuid NOT NULL REFERENCES reconstruction_cases (case_id) ON DELETE CASCADE,
    finding_id uuid NOT NULL DEFAULT gen_random_uuid(),
    request_label text CHECK (btrim(request_label) <> ''),
    statement text NOT NULL CHECK (btrim(statement) <> ''),
    assessment text NOT NULL CHECK (assessment IN (
        'supported', 'review_required', 'missing_evidence', 'excluded'
    )),
    review_state text NOT NULL DEFAULT 'pending',
    reviewer_key text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, finding_id),
    CONSTRAINT finding_review_consistent CHECK (
        (review_state = 'pending' AND reviewer_key IS NULL AND reviewed_at IS NULL)
        OR
        (review_state IN ('accepted', 'rejected') AND reviewer_key IS NOT NULL
         AND btrim(reviewer_key) <> '' AND reviewed_at IS NOT NULL)
    )
);

CREATE TABLE finding_citations (
    case_id uuid NOT NULL,
    citation_id uuid NOT NULL DEFAULT gen_random_uuid(),
    finding_id uuid NOT NULL,
    source_id text NOT NULL,
    start_line integer,
    end_line integer,
    json_pointer text,
    PRIMARY KEY (case_id, citation_id),
    FOREIGN KEY (case_id, finding_id)
        REFERENCES reconstruction_findings (case_id, finding_id) ON DELETE CASCADE,
    CONSTRAINT citation_source_fk FOREIGN KEY (case_id, source_id)
        REFERENCES evidence_sources (case_id, source_id) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT citation_location_consistent CHECK (
        (json_pointer IS NULL AND start_line IS NOT NULL AND end_line IS NOT NULL
         AND start_line >= 1 AND end_line >= start_line)
        OR
        (json_pointer IS NOT NULL AND json_pointer ~ '^(/([^~/]|~[01])*)*$'
         AND start_line IS NULL AND end_line IS NULL)
    )
);

CREATE INDEX finding_citations_by_finding ON finding_citations (case_id, finding_id);
CREATE INDEX finding_citations_by_source ON finding_citations (case_id, source_id);

COMMIT;
