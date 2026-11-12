# Packet-trust requirements after issue 14

The owner confirmed that [issue #14](https://github.com/shadrackbond/PayPal-rec/issues/14) stays focused on demo rehearsal and reproducible blockers. The following partner requirements are separate implementation work. The current milestone remains a private Sandbox prototype; multi-tenant authentication is planned later.

## Server-side review history

- Save Sandbox and future merchant decisions with case, claim, authenticated reviewer, timestamp and evidence version.
- Preserve previous decisions when a reviewer changes a decision. Require a fresh review when supporting evidence changes.
- Export from server-saved decisions. Keep browser-local decisions for the synthetic demo.
- Do not treat the shared workspace key as a reviewer identity. The reviewer authentication mechanism must be selected before implementing this work; a typed name or the shared key cannot establish authenticated attribution.
- Verify changed evidence, changed decisions, stale/concurrent submissions, reviewer attribution, case isolation and export from saved records. Existing finding/citation tables are unused by application code and have no decision-history table.

## Complete request coverage

- Show every known notice request in review and export, citing its original notice passage.
- Distinguish covered, partially covered, unmatched and needs interpretation. When a passage's request count is ambiguous, cite it and retain it for interpretation.
- Keep open requests separate from accepted claims. Agency R3 remains partially covered with receipts for D1/D2 and an open D3 gap; a single receipt must not mark the entire request covered.
- Verify unmatched/ambiguous notice passages survive parsing, review and export; rejection or missing evidence cannot hide an open requirement.
- Decide how evidence coverage and reviewer acceptance affect the displayed status before implementation. The current `unmatched_requests` list is not a complete coverage ledger.

## Matching boundary

Preserve the documented text formats and exact, same-currency reconciliation of one PayPal capture to one or more explicitly linked invoices. PDF/scan intake is separate work and must trace extracted text back to its source. Defer installments, partial payments and other payment relationships until explicit allocation rules and test cases exist.

Success means a reviewer can see who accepted a claim, exactly what evidence they reviewed and which requests remain open. None of the above is established by the issue #14 rehearsal.
