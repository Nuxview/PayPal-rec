# Sandbox integration feedback follow-up

The owner reported these findings after testing the real PayPal **Sandbox** integration. They are not a production-payment test or proof that an account limitation can be removed. No capture ID, exact test time or sanitized provider response was supplied in these notes.

| Finding | Response |
| --- | --- |
| Order ID versus capture ID was unclear | Return page now reads a validated order ID from `token` and displays the complete capture command. Documentation separates create, approve, capture and import, explains `PayerID`, and points to `capture_id` in successful CLI output. Approval/capture validation remains in the CLI. |
| Capture could be created before the workspace was ready | Setup guide now distinguishes CLI prerequisites from browser prerequisites. Browser review requires PostgreSQL, migrations and all configuration values; the CLI can preview a capture without a database. |
| Docker command block raced database startup | Container creation, repeated readiness checks and each migration have separate command blocks and explicit ordering. Failed readiness during startup is distinguished from a persistent database failure. |
| Workspace key purpose was unclear | UI and guide explain the shared eight-hour browser session, the server's expected environment key, access to all cases and the absence of reviewer identity. Locking does not delete stored evidence. |
| No clear next step after download | Review UI explains the draft, open follow-ups and merchant's separate PayPal submission. Existing cases cannot be edited; testing more evidence requires a new case with the same capture and complete updated document set. |
| Missing open-source license | Owner selected GPL v3 and the copyright holder Shadrackbond. Added root `LICENSE`, `GPL-3.0-only` package metadata and README link. GitHub's default-branch license display requires these changes to be merged. |
| UI overhaul | Deferred until functional gaps and limitations are addressed, as requested. These changes provide task guidance within the existing UI. |
| Supported source documents and conversion effort | UI/docs explicitly state UTF-8 `.txt` and documented record formats only, with no PDF/image/Word extraction or OCR. Generic text conversion is insufficient; citations currently refer to the text snapshot. This remains a product usability gap. |

## Remaining implementation work

- Add evidence to an existing case while preserving old snapshots, retaining review history and invalidating affected approvals. Do not silently overwrite sources or carry approval from an earlier evidence set.
- Support ordinary PDFs, scans/images and Word documents through extraction that can trace each cited passage to its original source. Keep the existing exact reconciliation rules.
- Complete authenticated reviewer attribution, server review history and request coverage from the [packet-trust backlog](packet-trust-backlog.md).
- Validate the target merchant need and preparation cost. The prototype's formatted-text intake and manual submission handoff do not yet establish reduced effort or better PayPal outcomes.

The [setup guide](paypal-sandbox-workspace.md) is the complete operator workflow. The checkout return page only supplies instructions; loading it never captures a payment. Testing and acceptance evidence for these changes must distinguish stubbed provider checks, local HTTP checks, standalone database checks and another owner-run Sandbox test.

## Verification - November 12, 2026

- `npm run lint`, `npm run typecheck`, `npm test` (40 passed) and the standard Turbopack production build passed on Node.js 26.13.0.
- Production HTTP rehearsal passed at 14:34 EAT (11:34 UTC), on temporary loopback port 38467. It checked the displayed order/capture instructions and missing, invalid, repeated and cancelled return tokens, along with the existing review/export flow. No PayPal call is made by the return page. See [HTTP checks](../output/pdf/demo-rehearsal/checks.json).
- A fresh disposable `postgres:16` container ran PostgreSQL 16.15. Five readiness attempts failed during startup before acceptance. Both migrations and `db/tests/001_case_evidence.sql` then passed; the smoke test left zero cases. The test container and its anonymous volume were removed. The owner's existing database was not used. See [database setup checks](../output/sandbox-integration/database-setup-check.json).
- The root license includes the unmodified full GPL v3 text from GNU plus the selected project copyright notice. Package and lockfile metadata agree on `GPL-3.0-only`. Local documentation links and shell examples were checked.

Actual PayPal checkout/capture was not repeated by the agent. Another owner-run Sandbox walkthrough is needed to confirm that the revised instructions resolve the reported confusion. Browser appearance, keyboard interaction and unassisted reviewer acceptance also remain unverified.
