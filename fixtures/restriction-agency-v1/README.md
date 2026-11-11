# Agency case fixture v1

A fictional design agency assembles a response to a simulated PayPal account limitation for one USD 2,400 payment. This fixture drives the database-free browser demo and reconstruction tests. A separate Sandbox adapter and workspace retrieve actual test captures.

- The fixture loader uses `inputs/manifest.json` to select the nine text documents; the payment loader reads `paypal-payment.json` separately. Paths in the manifest are relative to its directory. The manifest is not stored as an evidence source. `paypal-payment.json` is a normalized synthetic replay, not a raw PayPal API response or a record retrieved from PayPal Sandbox.
- All names, IDs, messages and records are invented. The merchant supplied the notice and business documents within the scenario. Use only the replay or a separately authorized sandbox test for development.
- Keep `evaluation/expected.json` out of application inputs, model prompts and search indexes. Compare reconstruction results against it after a run. Its finding IDs are grading labels; implementations may use their own IDs.
- Cite JSON fields by JSON Pointer and text evidence by inclusive, one-based line range. A citation identifies the supplied source; it does not independently authenticate the source.
- A reviewer should be able to confirm supported facts, surface unresolved items and omit unrelated material. The output is a draft for merchant review; this fixture does not model PayPal's assessment or an actual submission.
