# Case and evidence persistence

Run the initial migration against a disposable PostgreSQL 16+ database, then run the database smoke test:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_case_evidence.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/001_case_evidence.sql
```

The test rolls back its own data. Run the migration once per database. The schema has no dependency on the app framework.

| Table | Responsibility |
| --- | --- |
| `reconstruction_cases` | Owns the case UUID and an opaque merchant key assigned by the server. |
| `evidence_sources` | Stores a case-local source ID, origin, kind, display name and the exact text used for citations. |
| `reconstruction_findings` | Stores each claim or gap, its assessment, and its current merchant review decision. |
| `finding_citations` | Links a finding to a source in the same case with a one-based inclusive line range or a JSON Pointer. An empty pointer denotes the whole JSON document. |

For the agency demo, use the case label from the [input manifest](../fixtures/restriction-agency-v1/inputs/manifest.json) and assign a database UUID when creating the case. Preserve the manifest's source IDs as case-local keys. Keep its document kinds and record their origin as `synthetic_replay`; a real sandbox capture would use `paypal_sandbox`. Import only the manifest and its listed sources. The evaluation key stays outside the evidence store and is used to check results after reconstruction.

The composite foreign keys prevent orphaned and cross-case citations even when two cases reuse a source ID such as `SRC-02`. Directly deleting a cited source is blocked; removing a finding also removes its citations.

For an authorized case deletion, run the following in one transaction, passing the case UUID and the authenticated merchant key as parameters. Deferring the source check allows the case's source and finding cascades to finish before PostgreSQL checks the remaining citations.

```sql
BEGIN;
SET CONSTRAINTS citation_source_fk DEFERRED;
DELETE FROM reconstruction_cases WHERE case_id = $1 AND merchant_key = $2;
COMMIT;
```

Assessment and merchant review are separate. Accepting a review records the merchant's decision; it does not turn a gap or excluded document into verified evidence. Before export, later work must enforce the assessment and review rules. Treat cited source content as a snapshot: assign a new source ID to new content, and reset review when editing a finding or changing its citations. The schema checks locator shape; the ingestion and matching code must verify that each location resolves in the cited snapshot. Authenticated reads and writes must also check merchant ownership; foreign keys enforce case consistency, not authorization.
