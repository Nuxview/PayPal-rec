# Merchant acceptance record — issue 13

Status: **Owner-run acceptance completed: PASS with a usability follow-up, as reported by the reviewer.** Functional packet checks, PDF inspection, the production build and production HTTP smoke checks also passed on Node.js 26. The strict fresh-reviewer condition remains unverified.

The owner performed the merchant review when a separate reviewer was unavailable. They report project familiarity but no prior familiarity with the demo case. This conversation had previously described expected findings, so this record does not establish a fresh, uncoached discovery of them. The owner's reported result and the engineering evidence are recorded separately. GitHub #13 was closed as completed when checked on November 11; that issue state does not establish an unconditional fresh-reviewer PASS.

Scope: [upstream issue #13](https://github.com/shadrackbond/PayPal-rec/issues/13), “Run merchant acceptance testing.” A fresh reviewer must identify the mismatch, find the delivery gap and export the correct packet without coaching. The issue targets November 11, 2026 (Nairobi). Its dependency, [issue #12](https://github.com/shadrackbond/PayPal-rec/issues/12), was closed as completed when checked on November 10.

## Session details

| Field | Value |
| --- | --- |
| Engineering application base commit | `1bbd0e7f2996c502d4930c83c99083faec6aa695`; owner-session commit not supplied |
| Preflight date | November 10, 2026 (Africa/Nairobi) |
| Scenario | Synthetic agency fixture v1, `DEMO-AGENCY-001` |
| Reviewer / coordinator | Andrew Pierce (reviewer's usual alias); self-run, no separate coordinator reported |
| Session time and browser | November 11, 2026, 22:27 EAT (19:27 UTC); Brave Origin |
| Prior knowledge | Reviewer reports familiarity with the project only, not the demo case. Earlier conversation included expected findings; independence is unverified. |
| Task URL | `http://127.0.0.1:3000/demo/review` after starting the local server |
| Evidence location | Reviewer report transcribed below from this development conversation. Their downloaded ZIP was not supplied; engineering-generated artifacts below are separate. |

## Owner-run reviewer report

Reported by Andrew Pierce on November 11, 2026:

- Overall assessment: the evidence supports the claims, and inconsistencies are accurately flagged.
- Decisions: all proposed claims accepted because the supplied evidence backs them.
- Export: the downloaded PDF and JSON agree with those decisions and the evidence.
- Usability: no specific functional failure or help requirement was reported. Duplicate-looking evidence and the long citation list can overwhelm someone scanning the case or deciding where to start.
- Suggested improvement: group related evidence and give a short summary.

Owner-run functional result: **PASS (reviewer-reported)**. The report does not separately name the payer mismatch, D3 gap or unrelated handoff, and the owner's downloaded artifacts were not independently inspected. The engineering assessment below verifies those specific findings and packet contents separately.

### Additional short reviewer session: context and action order

Reported by the owner during issue #14 work. This was a brief session with a reviewer familiar with PayPal limitations and their procedure, with limited technical familiarity. The owner had to explain the scenario, events before the case, parties, agency/client arrangement, expected deliverables and the reviewer's role. At first glance, the request arrangement and order of actions were confusing.

This is useful partial usability feedback, not a comprehensive acceptance result. The reviewer identity, session time, browser, exact decisions and exported packet were not supplied. Discovery of the mismatch, identification of the delivery gap and export correctness were not individually reported. Do not infer a PASS or replace the earlier owner-run record with this session.

| Observation | Result / response |
| --- | --- |
| Case context and reviewer role | Needs improvement; owner explanation was required. Added a fixture-based introduction covering the merchant, client, payment, agreed deliverables and draft-review task. |
| Request arrangement and action sequence | Needs improvement; the initial flow was unclear. Grouped statements and follow-ups under their original requests, added numbered navigation, moved download after review and returned saved decisions to the relevant request. |
| Comprehensive acceptance | Not established by this short assisted session. The owner plans to seek one or two longer reviewer sessions. |

For the next sessions, give reviewers the revised neutral [task brief](merchant-acceptance-task.md). Ask them to explain the case and their first action after reading the in-app introduction, before providing help. Record any assistance and the observed result for each issue criterion separately. Context describes the setup and expected work; it must not state which evidence conclusions the reviewer should reach.

### Usability follow-up: citation volume and repetition

The reviewer found the amount of evidence overwhelming at first sight. Record this as a usability improvement, with no functional failure reported in this session. Before implementation, confirm where the repetition was most noticeable; the report does not distinguish the review screen from the exported packet.

Proposed smallest change: group citations by source document and place a brief factual evidence summary ahead of the expandable original excerpts. Preserve every exact source location and keep unresolved findings visible. Do not merge distinct excerpts or remove evidence simply because a source supports multiple claims. Verify that a reviewer can locate the supporting record without reading the full citation list, while every original citation remains accessible.

At the end of the #13 acceptance session, this follow-up was recorded only; the review UI and packet rendering had not been changed.

Issue #14 update: the owner clarified that citation overload affects both the review screen and PDF, with the screen more noticeable because the citations were close together, looked similar and took longer to review. Both now group citations by source document under each claim. The PDF gives locations their own column and labels continued groups; every original excerpt and location is retained. Production HTTP checks and PDF inspection verify preservation and decision/export behavior; browser usability confirmation is still pending. See the [rehearsal record](demo-rehearsal.md).

## Run the session

1. Use the repository's Node.js 26 runtime. Install from the lockfile with `npm ci` if needed. Build with `npm run build`, then run `npm start -- --hostname 127.0.0.1`. This scenario needs no database or PayPal credentials.
2. Use a fresh browser profile or private window so the review starts with pending decisions. Record the actual commit and browser before starting.
3. Give the reviewer only [the task brief](merchant-acceptance-task.md) and the task URL. Keep this coordinator record, the walkthrough, tests and evaluation key out of their task materials.
4. Observe without explaining the findings or telling the reviewer which decisions to make. Record each intervention. If case guidance is needed, mark that criterion FAIL for the uncoached run; a subsequent coached rehearsal does not replace it.
5. Capture the reviewer's conclusions and decisions before consulting the scoring criteria. Retain their original ZIP and notes. Inspect both exported files and record exact observations below.
6. Replace each NOT RUN with PASS or FAIL and its evidence. Overall PASS requires all three issue criteria to pass in a fresh, uncoached session. Keep incomplete or environment-blocked runs pending with the reason; do not close #13 based on automated checks alone.

## Coordinator scoring — do not give to the reviewer

| Issue criterion | Required observation | Result | Session evidence |
| --- | --- | --- | --- |
| Identify the mismatch | Reviewer independently identifies Kestrel Grove Finance as capture payer and Northline Botanics as invoice buyer. They treat the client's finance-partner explanation as attributed information, with authorization still requiring confirmation. | Fresh-reviewer result NOT CONFIRMED | Owner reports accurately flagged inconsistencies but does not identify this finding separately. Engineering check passed. |
| Find the delivery gap | Reviewer independently finds client receipts for D1 and D2 and the missing client receipt for D3. Internal archiving does not establish delivery; the similarly named handoff belongs to another project. | Fresh-reviewer result NOT CONFIRMED | Owner reports accurately flagged inconsistencies but does not identify this finding separately. Engineering check passed. |
| Export the correct packet | Reviewer downloads and opens the ZIP without coaching. Both files carry the synthetic label; accepted claims and citations match their decisions. Rejected/pending claim statements and the excluded handoff are absent. The payer follow-up and D3 gap remain open. | PASS (owner-reported); freshness unverified | Owner accepted all proposals and reports agreement between the PDF, JSON, decisions and evidence. Their ZIP was not supplied. Engineering checks separately passed filtering and open-gap cases. |

For each accepted claim, resolve its exported text lines or JSON Pointer against the original source. Check the PDF's readable text, pagination and excerpts as well as the JSON. Compare with `fixtures/restriction-agency-v1/evaluation/expected.json` only after the reviewer finishes.

Overall owner-run acceptance: **PASS with usability follow-up (reviewer-reported)**. Overall strict fresh-reviewer acceptance for #13: **NOT CONFIRMED**.

## Deadline fallback — informed engineering assessment

Run on November 10, 2026 at 16:40 UTC (19:40 Nairobi), using Node.js 26.13.0 and the application commit above. Assessor: Codex, with prior knowledge of the source, walkthrough and evaluation key. No independent reviewer or browser interaction was involved.

The application's actual demo `POST` handler was invoked in process with JSON and URL-encoded form requests. Exported claims came from the server's reconstructed snapshot. The resulting ZIP was opened, every citation was resolved against its original source, and both PDF pages were rendered with Poppler and visually inspected. This exercises application logic and output, not the browser's form submission or Server Actions.

| Engineering check | Result | Observation |
| --- | --- | --- |
| Payer mismatch | PASS | Kestrel Grove Finance differs from Northline Botanics; the client's explanation is attributed and the relationship remains open. |
| Delivery evidence | PASS | D1 and D2 receipts are proposed; D3 remains a gap and `SRC-10` is excluded. |
| Accepted claims | PASS | Export with all three proposals accepted contains exactly those three claims and two open follow-ups. An injected claim statement is ignored. |
| Source fidelity | PASS | All 33 exported citations resolve to the original source lines or JSON values. |
| Decision filtering | PASS | A form payload accepting allocation, rejecting D1 and leaving D2 pending exports only allocation; withheld statements are absent. |
| Invalid approvals | PASS | Stale version returns 409, accepting a diagnostic returns 400, and no accepted proposals returns 422. |
| Evidence removal | PASS | Removing `SRC-06` removes the D1 receipt proposal, opens its gap, changes the review version and rejects the old approval. |
| PDF content and appearance | PASS | Both A4 pages are readable with no visible clipping or overlap. All three statements, 33 excerpts, two follow-ups, synthetic labels and page numbers agree with the JSON. |

Retained local artifacts:

- [Application-generated ZIP](../output/pdf/merchant-acceptance/reviewed-evidence.zip), containing the original PDF and JSON.
- [PDF](../output/pdf/merchant-acceptance/reviewed-evidence.pdf), [JSON](../output/pdf/merchant-acceptance/reviewed-evidence.json), [extracted PDF text](../output/pdf/merchant-acceptance/reviewed-evidence.txt) and [assertion results](../output/pdf/merchant-acceptance/checks.json).
- ZIP SHA-256: `51e71ba30875a648aeac84e7a0b9b8d17352a51c3a8c1cd15e21bea51f88c18d`.

The artifacts contain synthetic data only. Review version: `29ea9b0bdf4fe0e69c993fbe0c2a325156aeb749e1079561bb1a739bc9faf761`.

The existing reproducible regression commands are `node --test tests/merchant-review.test.mjs tests/evidence-packet.test.mjs tests/reconstruction-flow.test.mjs tests/reconstruction-failure.test.mjs`. The additional one-off artifact assertions and PDF inspection are recorded above and in `checks.json`; no application behavior was changed.

## Production verification after permission update

On November 10, 2026, after full execution access became active, `npm run build` exited 0 using Next.js 16.4.5 with Turbopack on Node.js 26.13.0. Compilation, TypeScript and all nine static-page generation steps completed. The build used the current working tree, including the runtime metadata update; application source was unchanged.

`npm start -- --hostname 127.0.0.1 --port 0` started the production server on an automatically assigned loopback port and reported ready in 522 ms. The following actual HTTP checks passed at 17:57 UTC (20:57 Nairobi):

- `/api/health` returned 200 and `{ "status": "ok" }`.
- `/`, `/demo/payment` and `/demo/review` returned 200.
- A fresh demo review started with no decisions and displayed the payer mismatch and D3 follow-up.
- Multipart submissions to the production Server Action accepted allocation and rejected D1, returning the saved-decision redirect and a demo review cookie.
- Reloading the review with that cookie retained both decisions; D2 remained pending.
- Submitting the review's download form payload over HTTP returned a ZIP containing the PDF and JSON. Only allocation was accepted in the packet; D1 was rejected, D2 pending, both follow-ups remained open, synthetic provenance was retained and `SRC-10` was absent.

See the [production smoke results](../output/pdf/merchant-acceptance/production-smoke.json). The temporary server was stopped after verification. These checks used HTTP requests, not browser automation, and did not contact PayPal or mutate the database.

## Engineering preflight

These checks used the installed Node.js **26.13.0**. The owner approved the runtime upgrade; `.nvmrc` and the README select Node.js 26, while the package engine and lockfile allow `>=24 <27`. CI reads `.nvmrc`, so it uses Node.js 26. Validation here covers the selected Node.js 26 runtime; the other allowed major versions were not checked in this session.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| `npm run lint` | PASS | Exit 0; no warnings. |
| `npm run typecheck` | PASS | Route types generated and TypeScript exited 0. |
| `npm test` | PASS | All 11 test files passed; 0 failed, cancelled or skipped. Includes reconstruction, failure/isolation, review, Sandbox and ZIP/JSON checks. |
| `npm run build` | PASS | Independently completed with exit 0 after full execution permissions took effect. Earlier port-binding failures were environment restrictions. |
| Production startup and HTTP smoke | PASS | Production server started; health, pages, accept/reject Server Actions, decision reload and ZIP export passed. Server stopped after checks. |
| `npm run build -- --webpack` | Historical sandbox failure | Earlier alternative failed with `Could not parse output from TypeScript's --showConfig`. The standard Turbopack production build subsequently passed; Webpack was not retried. |
| Browser interaction | PASS (owner-reported); agent browser check NOT RUN | Owner completed review and export in Brave Origin on November 11. Agent browser access remained unavailable; the owner's report records citation overload as a usability concern. |
| PDF visual inspection | PASS | Deadline fallback rendered and inspected both pages and compared all statements/excerpts with the exported JSON. |
| Actual PayPal Sandbox smoke test | NOT RUN | The #13 scenario uses the synthetic demo; automated Sandbox tests use provider stubs. |

## Follow-up requirements outside this acceptance run

The owner selected #13 acceptance testing before the packet-trust implementation. The following remain requirements, not completed behavior:

- Sandbox decisions must be saved on the server with case, claim, authenticated reviewer, timestamp and evidence version; retain decision history, invalidate stale reviews and export from saved decisions. The shared workspace key does not establish reviewer identity.
- Review and export must show every known notice request with its original citation and coverage status, including passages needing interpretation. R3 is partially covered while D3 remains open. The current packet lists diagnostics but has no complete request-coverage ledger.
- Preserve exact, same-currency reconciliation of one capture to explicitly linked invoices. PDF/scan intake and other payment relationships are separate work.

The broader release scenarios in `CONTRIBUTING.md`, including changed names and amounts together, payer corrections and an application case-deletion flow, are not established by this record. Evidence removal and stale-approval rejection were checked in the engineering assessment; they were not tested through a browser editing flow. Record the remaining scenarios separately when the corresponding flows exist.
