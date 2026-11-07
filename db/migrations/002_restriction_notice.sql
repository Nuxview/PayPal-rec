BEGIN;

CREATE TABLE restriction_notices (
    case_id uuid NOT NULL,
    source_id text NOT NULL,
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    parser_version smallint NOT NULL CHECK (parser_version > 0),
    captured_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, source_id),
    FOREIGN KEY (case_id, source_id)
        REFERENCES evidence_sources (case_id, source_id) ON DELETE CASCADE
);

CREATE TABLE restriction_notice_requests (
    case_id uuid NOT NULL,
    notice_source_id text NOT NULL,
    request_label text NOT NULL CHECK (request_label ~ '^(R|L)[1-9][0-9]*$'),
    request_text text NOT NULL CHECK (btrim(request_text) <> ''),
    start_line integer NOT NULL CHECK (start_line >= 1),
    end_line integer NOT NULL CHECK (end_line >= start_line),
    PRIMARY KEY (case_id, notice_source_id, request_label),
    FOREIGN KEY (case_id, notice_source_id)
        REFERENCES restriction_notices (case_id, source_id) ON DELETE CASCADE
);

COMMIT;
