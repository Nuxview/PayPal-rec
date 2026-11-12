# Import case documents

After `npm ci`, preview the agency fixture from the repository root:

```sh
npm run documents:import -- --fixture
```

The command lists nine documents with their original `SRC-xx` IDs and `synthetic_replay` provenance. The simulated notice is available as `SRC-01`; parsing its requests is separate. The command does not read the evaluation answer key or import `SRC-02`, which belongs to the [PayPal payment importer](paypal-import.md).

For merchant evidence, use one or more local UTF-8 `.txt` files:

```sh
npm run documents:import -- --file invoice.txt --file delivery-note.txt
```

The importer accepts up to 25 files per command, at most 256 KiB per file. It rejects unsupported extensions, empty or invalid text, and PDF headers even when a file is renamed to `.txt`. PDFs, images and Word documents are not accepted or converted by this app; it has no OCR. For this prototype, prepare UTF-8 text manually using the [supported record formats](paypal-sandbox-workspace.md#make-a-matching-test-case). Merely converting a document to arbitrary plain text does not ensure the matcher can read it. Citations resolve to the supplied `.txt` snapshot, not an original PDF, image or office document.

Both commands preview by default. To store the documents, set `DATABASE_URL` in `.env.local` or your shell and use an existing case UUID and its merchant key. See the [case setup example](paypal-import.md#store-the-payment-as-case-evidence).

```sh
npm run documents:import -- --fixture --case "$CASE_UUID" --merchant "$MERCHANT_KEY"
# Or add the same --case and --merchant flags to the --file command.
```

Merchant text is stored as `merchant_provided`. Within a case, identical bytes get the same `DOC-<sha256>` ID even under a different filename. The first snapshot stays intact. Original text and newlines are preserved for one-based line citations. An unchanged rerun reports `already_imported`. A conflicting snapshot or rejected file leaves the entire batch unwritten. The CLI prints metadata only; it does not print document text. Browser uploads are available separately through the private [Sandbox workspace](paypal-sandbox-workspace.md), with an additional 768 KiB total upload limit including the notice.
