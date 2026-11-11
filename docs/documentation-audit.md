# Documentation audit — November 11, 2026

Audited all 12 existing Markdown documents against application source, CLI entry points, SQL migrations, tests, package scripts, `.nvmrc`, `.env.example` and the GitHub Actions workflow at base commit `b68c5d8`. Corrections are on `docs/documentation-audit`. Application code, configuration and historical test artifacts were not changed by this audit.

## Findings and corrections

| Priority | Documentation drift | Implementation evidence and correction |
| --- | --- | --- |
| High | The persistence guide described finding/review tables without explaining that the application does not use them. It also implied authenticated merchant identities. | [Sandbox actions](../app/sandbox/actions.ts) save decisions in cookies; [case loading](../lib/evidence/sandbox-case.ts) recomputes findings under one shared merchant key. [Persistence docs](../db/README.md) now distinguish active tables, unused schema, operator selectors and shared access. No database reviewer history exists. |
| High | Contributor guidance said application tests did not yet exist and described authenticated job/worker/model paths as integration coverage. | [CI](../.github/workflows/ci.yml) runs the existing Node/PGlite suite; there are no job workers, model service or multi-merchant login. [Contributor guidance](../CONTRIBUTING.md) now separates current checks from future release requirements. |
| Medium | The persistence guide deferred export filtering and citation checks to later work. | [Packet validation](../lib/evidence/evidence-packet.ts) already restricts export to accepted proposals and checks the review version. [Snapshot construction](../lib/evidence/review-snapshot.ts) resolves citations and hashes the report and sources. The guide now describes those safeguards and their application-level scope. |
| Medium | Sandbox documentation omitted review storage, expiry and the combined upload limit. | [Session configuration](../lib/paypal/sandbox-access.ts) and [actions](../app/sandbox/actions.ts) enforce eight-hour sessions/review cookies, a minimum 24-character key and limits of 25 files, 256 KiB each and 768 KiB total. These are now documented in the [workspace guide](paypal-sandbox-workspace.md). |
| Medium | Contributor UAT required rejecting an excluded handoff and using correction/deletion flows that the UI does not offer. | [Review UI](../app/demo/review/review-workspace.tsx) exposes decisions only on proposals. The current workflow is documented separately from future correction, editing and deletion acceptance requirements; SQL deletion remains documented as an operator action. |
| Medium | The matching guide did not explain why an unmatched-request list cannot establish complete coverage. | [Matching](../lib/evidence/match.ts) treats a request as matched when any proposal refers to it. R3 therefore drops out of `unmatched_requests` while D3 remains open. The guide now states that a complete coverage ledger is still unimplemented. |
| Low | The fixture overview predated the Sandbox adapter and implied importing the manifest itself as evidence. | [Fixture document loading](../lib/evidence/documents.ts) uses the manifest to select text files; [payment replay](../lib/paypal/replay.ts) loads the payment separately. The fixture and persistence guides now describe that behavior. |
| Low | The import guide's web-upload wording was ambiguous, and the review walkthrough omitted request labels from omitted-proposal metadata. | [Document import](document-import.md) now links to the separate private browser upload flow. The [review walkthrough](merchant-review.md) now describes the heading and packet fields accurately, including the absence of reviewer history and full request coverage. |
| Low | The acceptance record's final paragraph said evidence-removal testing was unestablished despite recording an engineering check for it. | The [record](merchant-acceptance-results.md) now distinguishes the completed engineering check from an unavailable browser editing flow. Reviewer statements and recorded historical results were preserved. |

## Documents verified

- [README](../README.md): Node.js 26 is selected by `.nvmrc` and CI; the package engine allows `>=24 <27`. Added current limits and a link to this audit.
- [Contributor guide](../CONTRIBUTING.md), [persistence guide](../db/README.md) and [fixture overview](../fixtures/restriction-agency-v1/README.md): corrected as listed above.
- [Document import](document-import.md), [evidence matching](evidence-matching.md), [merchant review](merchant-review.md) and [Sandbox workspace](paypal-sandbox-workspace.md): corrected scope and limits as listed above.
- [PayPal import](paypal-import.md): CLI flags, capture-only payer limitations, provenance and idempotency match the code. The browser workspace's optional linked-order lookup is documented in its own guide.
- [Notice capture](restriction-notice.md): supported labels/list shapes, unknown/partial extraction behavior, line locations and snapshot validation match the parser and store.
- [Acceptance task](merchant-acceptance-task.md) and [acceptance record](merchant-acceptance-results.md): the task remains neutral; the record distinguishes owner-reported acceptance, engineering checks and the unverified fresh-reviewer criterion.

## Verification performed

All checks below passed on Node.js 26.13.0:

- `npm test`: 39 tests passed; no failures or skips.
- `npm run paypal:import -- --replay`: the documented USD 2,400 capture and preview result.
- `npm run documents:import -- --fixture`: nine document previews, without importing the payment.
- `npm run notice:capture -- --fixture`: R1, R2 and R3 extracted.
- `npm run evidence:match -- --fixture`: three proposals, R2 unmatched and `SRC-10` excluded.
- Both SQL migrations followed by `db/tests/001_case_evidence.sql` in a disposable PGlite database; smoke-test data rolled back.
- The five text examples extracted directly from the Sandbox guide produced an allocation and receipt. Removing its receipt example produced a D1 delivery gap. The unknown payer left R2 unmatched.
- Local Markdown targets and heading anchors, documented npm script names and `git diff --check`.
- Final sanity pass: repeated all 39 tests, the four preview commands and the Sandbox text examples. Source assertions also checked runtime/CI alignment, session and upload limits, absence of application finding-table queries, fixture counts, partial-delivery behavior and exported metadata. All passed; no additional documentation mismatch was found in the checked scope.

No application build was repeated for these Markdown-only changes. PayPal API calls, Docker/standalone PostgreSQL setup, external link availability and browser interaction were not exercised in this audit. Earlier production and owner-review evidence remains in the dated acceptance record.

## Remaining implementation gaps

Documentation now explicitly records the current limits: shared workspace access without reviewer identity, browser-cookie decisions without a database audit trail, incomplete request-coverage reporting, text-only intake, no browser evidence-editing/correction/deletion flows and no independent fresh-reviewer acceptance result. The existing contributor release blockers remain in force. Implementing these features requires separate changes and acceptance evidence.
