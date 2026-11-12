# AI evidence gap review

The rule matcher handles exact reconciliation and source-backed proposals. The selected AI provider reads excerpts of the notice and supplied text, including material the matcher did not recognize, and suggests gaps, contradictions and the next record to look for.

1. Set the provider and key in the ignored `.env.local` file, or as server-only variables in your deployment. Restart or redeploy after changes. Do not use a `NEXT_PUBLIC_` prefix for keys.
2. For the public synthetic agency case, set `AI_PUBLIC_DEMO=true`. This enables AI only on the bundled fictional records. The app shares an in-flight request and caches results for up to an hour per running instance; this is not a deployment-wide quota. Leave the flag off for private Sandbox use only. The older `GEMINI_PUBLIC_DEMO` flag is honored only for an explicitly selected Gemini configuration when `AI_PUBLIC_DEMO` is unset.
3. Open a case review and select **Analyze evidence**. Open **Check source excerpts** on each result to compare the suggestion with the evidence. The case is still reviewable if AI is unavailable.

| Provider | Selector | Server key | Optional model override |
| --- | --- | --- | --- |
| [NVIDIA NIM](https://build.nvidia.com/meta/llama-3_3-70b-instruct) | `AI_PROVIDER=nvidia` (default) | `NVIDIA_API_KEY` | `NVIDIA_NIM_MODEL`, defaults to `meta/llama-3.3-70b-instruct` |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/api-key) | `AI_PROVIDER=gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL`, defaults to `gemini-3.5-flash-lite` |

Use a hosted text instruction model available to your provider account. The app makes an inference request only to the configured provider. A missing key, quota error or unusable output does not send data to another provider. You can remove the Gemini key from the environment if you no longer use it.

Analysis is opt-in. Selecting the button sends bounded document excerpts, limited capture details (ID, amount, status and payer name), and the matcher’s signals to the displayed provider. Use synthetic or authorized Sandbox records. The UI shows when text was omitted. The app does not store the AI output in case history or send it to PayPal.

The server rejects malformed output and references to unknown requests or excerpts. A valid reference identifies source lines; it does not establish that the interpretation is correct. AI cannot accept claims, reconcile amounts, update the evidence, or insert suggestions into an export. Deterministic review and human decisions still govern the packet.

For a live smoke test, open the fixed synthetic case with a configured key. Confirm that the page shows the expected provider and model, findings cite source excerpts, and the accepted-claim count and export remain unchanged after analysis.
