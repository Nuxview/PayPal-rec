# Gemini evidence gap review

The rule matcher handles exact reconciliation and source-backed proposals. Gemini reads the submitted text, including material that the matcher did not recognize, and suggests gaps, contradictions and the next record to look for. For example, it can flag a delivery acknowledgment that does not establish which project or deliverable it covers and suggest requesting that detail from the client.

1. Create a [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key). Set `GEMINI_API_KEY` in `.env.local` or as a server-only environment variable in the deployment. Do not use a `NEXT_PUBLIC_` prefix. `GEMINI_MODEL` is optional; it defaults to `gemini-3.5-flash-lite` and must name a Gemini model that supports structured text output.
2. For the public synthetic agency case, also set `GEMINI_PUBLIC_DEMO=true`. This lets anyone run Gemini against the bundled fictional case only. It can consume API quota. The app shares an in-flight request and caches results for up to one hour per running instance; this is not a deployment-wide quota. Use a project with appropriate quota limits. Leave this flag off for private Sandbox use only.
3. Restart or redeploy the app, open a case review and select **Analyze evidence**. Open **Check source excerpts** on each result to compare the suggestion with the evidence. The case is still reviewable if the key is absent or the API is unavailable.

Analysis is opt-in. Selecting the button sends bounded excerpts of the notice and case documents, limited normalized capture details (ID, amount, status and payer name), and a summary of the matcher’s signals to Google. Use only synthetic or authorized Sandbox records. File content may include identifying information. Very long inputs are excerpted; the UI shows when text was omitted. The Gemini call does not store its output in case history or send it to PayPal.

The server rejects malformed outputs and references to unknown requests or excerpts. A valid citation establishes which source lines were supplied; it does not prove the interpretation. Gemini does not accept claims, reconcile amounts, update the evidence, or enter suggestions into the exported packet. The deterministic review and human decisions continue to govern export. This integration does not add PDF, image, or Word intake.

For a live smoke test, run the fixed synthetic case with a configured key. Confirm that results cite real source excerpts, the payer question and missing delivery evidence are addressed if identified, and the accepted-claim count and export remain unchanged.
