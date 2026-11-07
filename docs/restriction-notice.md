# Capture a restriction notice

The notice is a document the merchant supplies. Capturing it records what the document says; it does not fetch a PayPal limitation or authenticate the notice.

## Preview the synthetic notice

```sh
npm run notice:capture -- --fixture
```

The command previews three requests from simulated source `SRC-01`: `R1` at line 6, `R2` at line 7 and `R3` at line 8. No database is needed.

## Capture a notice in a case

Apply the [migrations](../db/README.md), set `DATABASE_URL`, and [import the notice document](document-import.md) into the case. Pass the returned source ID explicitly. Use `SRC-01` after importing the agency fixture, or the `DOC-…` ID returned for a merchant's text file.

```sh
npm run notice:capture -- --case "$CASE_UUID" --merchant "$MERCHANT_KEY" --source "$NOTICE_SOURCE_ID"
```

The command checks that the source belongs to the specified merchant and case. It saves requests linked to the original evidence snapshot, using inclusive one-based line numbers. Rerunning the same snapshot reports `already_captured` without inserting duplicates. Output includes notice text excerpts; run it locally for merchant documents.

## What gets extracted

- Explicit, single-line labels such as `R1: Provide the invoice.`
- One item per line in a bulleted or numbered list immediately under `Requested documents:`, `Requested information:`, or `Requests:`. Unlabelled items get a source-line key such as `L7`.
- If present exactly once, the printed values under `Case reference:`, `Dated:`, `To:`, `Payment under review:`, `Reason:`, and `Deadline:`, each with its own citation. An absent, empty, or ambiguous field is `null`.

Unmarked prose and unsupported layouts are not interpreted. An empty explicit item or repeated label is left unresolved. No extracted items returns `request_state: "unknown"` and an empty list, which does not mean PayPal asked for nothing. Extracted requests are only the items recognized in the supplied text. For matching work, select the captured notice by case UUID and source ID, then read its rows from `restriction_notice_requests` in line order.
