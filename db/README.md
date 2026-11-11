# Case and evidence persistence

Run the migrations in order against a disposable PostgreSQL 16+ database, then run the database smoke test:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_case_evidence.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_restriction_notice.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/001_case_evidence.sql
```

The test rolls back its own data. Run each migration once per database. The schema has no dependency on the app framework.

| Table | Responsibility |
| --- | --- |
| `reconstruction_cases` | Owns the case UUID and merchant key. The Sandbox workspace uses one fixed server-side key; CLI operators supply the key of an existing case. |
| `evidence_sources` | Stores a case-local source ID, origin, kind, display name and the exact text used for citations. |
| `reconstruction_findings` | Schema for a claim or gap, assessment and current review decision. Exercised by the SQL smoke test; application code does not currently populate or read it. |
| `finding_citations` | Schema for linking a finding to a source in the same case with a one-based inclusive line range or JSON Pointer. An empty pointer denotes the whole JSON document. Exercised by the SQL smoke test; not used by the current application. |
| `restriction_notices` | Records a captured notice by its case and source ID, with the snapshot digest and parser version. |
| `restriction_notice_requests` | Stores explicit requests from one captured notice, with their original source line ranges. |

The browser agency demo runs from fixture files without a database. To store a replay through the CLIs, create a case using the label from the [input manifest](../fixtures/restriction-agency-v1/inputs/manifest.json) and assign a database UUID. Preserve the manifest's source IDs and kinds, with origin `synthetic_replay`; a capture retrieved from PayPal Sandbox uses `paypal_sandbox`. The document importer reads the manifest to select its nine text sources; the payment importer owns `SRC-02`. Neither the manifest nor the evaluation key is stored as an evidence source. The evaluation key is used only to check reconstruction results.

The current application recomputes findings and resolves citations from source snapshots. Demo decisions live in a browser cookie for seven days; Sandbox decisions live in a case-specific browser cookie for eight hours. Neither flow records reviewer identity, decision history or decisions in the finding tables. Sandbox exports read that review cookie after checking workspace access. Database-backed review history remains future work.

The composite foreign keys prevent orphaned and cross-case citations even when two cases reuse a source ID such as `SRC-02`. Directly deleting a cited source is blocked; removing a finding also removes its citations.

The application has no case-deletion route or CLI. For a separately authorized operator deletion, use the following parameterized SQL in one transaction, passing the case UUID and its merchant key. These placeholders must be bound by the database client. Deferring the source check allows the case's source and finding cascades to finish before PostgreSQL checks the remaining citations.

```sql
BEGIN;
SET CONSTRAINTS citation_source_fk DEFERRED;
DELETE FROM reconstruction_cases WHERE case_id = $1 AND merchant_key = $2;
COMMIT;
```

Assessment and merchant review are separate. The current review queue permits decisions only on proposed matches; gaps and exclusions cannot be accepted into a packet. Export validates the current review version and includes only accepted proposals with resolved citations. Changes to the report or any source snapshot invalidate the saved decisions for that review. This is enforced by application code, not database triggers.

Treat source content as immutable snapshots: importers reject changed content under an existing source ID. The schema checks citation locator shape; the review code also checks that each location resolves to the snapshot. Case ownership is checked in application queries. CLI `--merchant` is an operator-supplied selector, not a login, and the Sandbox uses a shared workspace session. Composite foreign keys enforce case consistency; they do not provide authentication or tenant authorization on their own.
