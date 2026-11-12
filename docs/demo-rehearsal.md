# Demo rehearsal - issue 14

Scope: [issue #14](https://github.com/shadrackbond/PayPal-rec/issues/14), retest UAT failures, rehearse the synthetic case end to end and verify replay fallback before the November 12 demo. Dependency [#13](https://github.com/shadrackbond/PayPal-rec/issues/13) is closed on GitHub; its [acceptance record](merchant-acceptance-results.md) reports an owner-run pass with citation overload and leaves independent fresh-reviewer acceptance unverified.

The owner clarified that citation overload affects both the review screen and PDF, with the screen more noticeable because citations were close together, looked similar and took longer to review. The shared demo/Sandbox citation inspector now groups excerpts by source document, displaying source names and counts. The PDF also groups by source within each claim, placing locations in a separate column and repeating source headings when a group continues onto another page. The existing factual claim statement stays above its evidence. Every exact excerpt and location remains accessible under each claim; distinct excerpts are not merged or deleted. Packet JSON, matching and decision storage are unchanged. Browser usability confirmation remains pending.

A subsequent short, assisted reviewer session exposed missing context and unclear action order. The demo now introduces the agency, client, named payer, supplied invoices and expected deliverables directly from fixture records, and explains the reviewer's role. A numbered path leads from case context through notice-order request groups to download at the end. Each request retains its original wording and source line, with proposed statements and follow-ups together. Saving a decision returns to that request. This presentation change does not establish complete request coverage or change the packet's evidence conclusions. See the separate [session record and next-reviewer protocol](merchant-acceptance-results.md#additional-short-reviewer-session-context-and-action-order).

## Run the demo

Use Node.js 26 and the lockfile dependencies. Run `npm run build`, then `npm start -- --hostname 127.0.0.1`. In another terminal run:

```sh
npm run demo:rehearse
```

For a different local port, pass its origin, for example `npm run demo:rehearse -- http://127.0.0.1:3001`. The command only accepts loopback HTTP origins. It uses a fresh synthetic-review cookie jar, submits the rendered forms without executing JavaScript, and writes synthetic artifacts to `output/pdf/demo-rehearsal/`, replacing artifacts from a previous rehearsal there. It does not use the operator's browser cookies or call PayPal or PostgreSQL.

For the live walkthrough:

1. Open `/demo/review` in a private window. Confirm the **Synthetic demo** label and USD 2,400 capture. Read **Start here: your role and the case**, then use the numbered navigation to review requests in notice order. Read each statement, expand **Inspect citations**, then expand a document. Confirm exact line numbers and JSON locations remain readable. Check keyboard access and a narrow viewport.
2. Show the allocation to both invoices and the D1/D2 client receipts. Keep the payer mismatch, attributed client explanation and missing D3 receipt visible. The other project's handoff remains excluded.
3. Accept allocation, reject D1 and leave D2 pending. Reload, then download and open the ZIP. Only allocation should be included as an accepted claim; rejected/pending proposals and both open follow-ups remain identified separately.
4. Change D1 to accepted and accept D2. Download again: three accepted claims, with payer/D3 follow-ups still open and the unrelated handoff absent. R3 is not fully covered; the current packet has no complete request-coverage ledger.
5. Confirm the PDF and JSON agree. Nothing is submitted to PayPal. Demo decisions remain browser-local and have no authenticated reviewer attribution.

## Explicit replay fallback

If Sandbox credentials, the provider, the database or the network are unavailable, explain the failure and open `/demo/review` explicitly. Use `/demo/payment` to show the fixture provenance. The replay needs the local app server and bundled fixture files, and works without PayPal or database services. Do not relabel it as a retrieved Sandbox capture. Sandbox errors must remain errors; there is no automatic substitution of fixture data into an imported case.

The rehearsal command injects a 503 response into the Sandbox adapter and verifies rejection, then starts a fresh HTTP demo review and exports from it. This checks an explicit switch to replay with a stubbed provider failure, not an actual provider outage or browser navigation from a failing Sandbox case. Keep a successfully built app running locally before presenting.

## Engineering result - November 11, 2026

The November 11 production HTTP rehearsal passed at **23:07 EAT (20:07 UTC)** on Node.js **26.13.0**, from base commit `2177bc8` plus this issue branch. The standard Turbopack build was served on temporary loopback port 42895; the server was stopped after verification. This includes the onboarding and request-order changes after the earlier PDF rehearsal at 16:05 EAT. No independent reviewer or browser automation was involved in the engineering check.

| Check | Result |
| --- | --- |
| ESLint and TypeScript | PASS |
| Node/PGlite regression suite | PASS; 40 tests across 11 files, no failures or skips; includes source grouping and multi-page group continuation |
| Standard Turbopack production build | PASS after the permission update and moving the stale Turbopack cache aside; default build configuration unchanged |
| Production build with `npm run build -- --webpack` | Earlier fallback PASS; final rehearsal uses the standard Turbopack build |
| Production health, home, payment and review routes | PASS |
| Context and action order | PASS over HTTP; source-derived parties, project and expected work, original requests in notice order, related statements/follow-ups in their request sections, download after review |
| Grouped sources and preservation of every rendered citation/excerpt | PASS |
| Native accept/reject, decision changes and reload | PASS; saving redirects to the relevant request anchor |
| Mixed-decision and all-accepted ZIP exports | PASS; JSON agrees with the reconstructed snapshot; payer/D3 follow-ups remain open |
| Stale review export | PASS; redirected to review-changed feedback |
| Replay after stubbed Sandbox failure | PASS; no automatic substitution |
| Non-loopback rehearsal target | PASS; rejected before making a request |
| Exported PDF | PASS; 14 grouped source headings replace 33 repeated headings, retaining all 33 citations and both open follow-ups in two A4 pages; both pages visually inspected without clipping or overlap |
| Packet JSON | PASS; identical to the earlier all-accepted agency packet |
| Review-screen appearance, keyboard interaction and usability | NOT RUN; browser access host unavailable |
| Fresh, uncoached reviewer | NOT RUN; still distinct from the owner-run #13 report |
| Actual PayPal / standalone PostgreSQL | NOT RUN; no adapter changes or release certification in this rehearsal |

Evidence: [HTTP assertions](../output/pdf/demo-rehearsal/checks.json), [reviewed ZIP](../output/pdf/demo-rehearsal/reviewed-evidence.zip), [PDF](../output/pdf/demo-rehearsal/reviewed-evidence.pdf), [JSON](../output/pdf/demo-rehearsal/reviewed-evidence.json) and [extracted PDF text](../output/pdf/demo-rehearsal/reviewed-evidence.txt). These are synthetic engineering artifacts, separate from the owner's #13 download.

The engineering rehearsal establishes functional readiness under the checks above. Before treating the review-screen usability follow-up as accepted, run the browser walkthrough and record the reviewer's result. Keep the upstream issue open until the remaining acceptance evidence is accepted by the owner. Server review history, authenticated attribution and complete request coverage are tracked separately in the [packet-trust backlog](packet-trust-backlog.md).

## Sandbox setup follow-up - November 12

The [Sandbox feedback record](sandbox-test-feedback.md) records the owner's integration findings and subsequent checkout-return, setup, access-key, document-format and handoff guidance changes. A new production HTTP rehearsal at 14:34 EAT passed the existing checks plus return-page order/capture instructions and missing, invalid, repeated and cancelled tokens. The retained HTTP report and draft artifacts now come from this rerun; packet JSON is unchanged. A separate disposable PostgreSQL 16.15 test verified readiness, both migrations and the SQL smoke test. These checks do not replace another real Sandbox checkout or browser usability session.
