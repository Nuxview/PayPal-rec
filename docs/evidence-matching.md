# Match evidence

Preview the synthetic agency case after `npm ci`:

```sh
npm run evidence:match -- --fixture
```

The report proposes the single USD 2,400 payment against both invoices, proposes receipts for D1 and D2, and excludes `SRC-10` because its handoff is for a different project. Each proposal and exclusion includes case source IDs with one-based line ranges or JSON Pointers. The CLI reads the fixture inputs; it does not read the evaluation answer key.

To run on an existing case, [import its payment](paypal-import.md), [import its documents](document-import.md), and [capture its notice](restriction-notice.md). Set `DATABASE_URL` and select the stored notice and payment sources explicitly:

```sh
npm run evidence:match -- --case "$CASE_UUID" --merchant "$MERCHANT_KEY" \
  --notice "$NOTICE_SOURCE_ID" --payment "$PAYMENT_SOURCE_ID"
```

For the stored agency replay, these source IDs are `SRC-01` and `SRC-02`. The stored mode reads one case in a database transaction and confirms that its captured requests still resolve to the original notice. Both modes are read-only and produce proposals for review.

The matcher supports the explicit text shapes in the agency fixture: a notice naming a capture and amount; a statement of work with a project and client contact; invoices with project, buyer and totals; and correspondence with explicit allocation or receipt wording. It requires the named capture to reconcile exactly, in one currency, to the cited invoices. A proposed delivery also needs the same project, client contact and deliverable in scope, invoice and receipt. A same-named handoff for a different project is not delivery evidence. Synthetic records are never used to support a Sandbox capture.

The report leaves unmatched requests open. It does not decide that a service was delivered merely because it appears in an invoice or project log. Other text formats and ambiguous records may yield no proposals. Payer contradictions, per-deliverable gaps and review decisions belong to the subsequent stages.
