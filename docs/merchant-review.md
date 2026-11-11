# Review the agency case

For an uncoached acceptance session, give a fresh reviewer only the [acceptance task](merchant-acceptance-task.md). Coordinators should use the separate [acceptance record](merchant-acceptance-results.md); this walkthrough reveals the expected findings.

Run `npm ci` and `npm run dev`, then open [the review screen](http://localhost:3000/demo/review). It runs the matcher against the synthetic agency inputs. It does not require a database, PayPal credentials or the evaluation answer key.

1. Open **Inspect citations** on a proposed match. Select a citation to see its source name and original line text or JSON field value.
2. Accept or reject the proposal. You can change your decision and reload the page to verify it is saved. Neither action edits the original evidence.
3. Inspect **Needs follow-up** for the payer mismatch and the missing receipt for D3. These findings and the excluded handoff are visible for investigation and cannot be accepted as supported matches.
4. Select **Download reviewed packet** after accepting at least one proposal. The ZIP contains a readable PDF and a JSON copy for further review.

Decisions for this demo stay in a first-party cookie in the current browser for seven days. Accept, Reject and Download work even when the page scripts are unavailable. Decisions are tied to the current report and source snapshots, so a changed evidence set starts with pending decisions. The server checks that version again before creating a packet. The screen does not open arbitrary merchant cases or submit anything to PayPal.

Both files mark the case as synthetic. The packet contains only accepted claim statements and their cited excerpts. The payer review and D3 delivery gap are listed separately with next evidence to collect. Rejected and pending proposals are identified by request, title and decision only; their statements and excerpts are omitted. The excluded handoff is left out entirely. The packet has no reviewer identity or decision-history audit trail, and it does not enumerate every notice request with a coverage status.

Run the full reconstruction check with `node --test tests/reconstruction-flow.test.mjs` after `npm ci`. It imports the agency inputs into a fresh embedded PostgreSQL database, captures the notice, matches the stored evidence, applies review decisions, and opens the resulting ZIPs to compare the claims, citations and gaps with the separate answer key. The test also runs in the normal `npm test` suite and does not need Sandbox credentials.

Run `node --test tests/reconstruction-failure.test.mjs` to exercise missing or incomplete payment data, repeat and ambiguous imports, and receipts from another case under the same merchant. The checks verify that unsupported claims and approvals from a different evidence snapshot cannot enter the packet. These tests also run in `npm test` without Sandbox credentials.
