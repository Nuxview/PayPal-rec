# Deploy to Vercel with MongoDB

Import the PayPal Rec repository into Vercel. Use the repository root, the Next.js framework preset and Node.js 26.x. Keep the default build command, which runs `npm run build`. The synthetic demo at `/demo/review` works without any environment variables and can be shared with judges. See [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Node.js 26 support](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel).

## Connect the private Sandbox workspace

Add these server-side environment variables to the Vercel environment you intend to use, then deploy or redeploy.

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas connection string, or connect the MongoDB Atlas Marketplace integration to populate it. |
| `MONGODB_DB` | Database name. Defaults to `paypal_rec`. Use a separate database and credentials for preview deployments that need Sandbox access. |
| `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET` | Credentials from a PayPal Sandbox seller app. |
| `PAYPAL_SANDBOX_WEB_KEY` | Shared workspace key. Generate it with `openssl rand -hex 32` and give it only to authorized testers. |
| `PAYPAL_SANDBOX_RETURN_ORIGIN` | The public HTTPS origin users actually open for browser checkout, for example `https://paypal-rec.vercel.app`. Use the same origin for the return so the browser can use its workspace session. |

With a manually configured Atlas connection, give the app's database user `readWrite` on the selected database and configure Atlas network access for your Vercel runtime. The Marketplace integration can grant broader database and network access, so use a cluster dedicated to this submission if you choose that integration. Keep URI and credential values out of Git. See [Atlas integration and access behavior](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/).

MongoDB creates the `sandbox_cases` collection on the first successful import. It stores the capture and the immutable evidence together in a single write. With `MONGODB_URI` set, the browser uses MongoDB for all case operations. Existing PostgreSQL cases stay in their original database. You can still access them in a local workspace configured with just `DATABASE_URL`. The database-backed CLI import and matching tools still use PostgreSQL.

## Diagnose Sandbox storage failures

An Atlas cluster can be running while the application cannot reach it. Check **Recent cases** after unlocking the workspace. A connection error means the app could not reach the cluster; compare the app host's outbound address with the Atlas network access list. A credential error points to the database user and password, and a write-permission error means the account cannot save into the configured database. PayPal Sandbox checkout can succeed independently of case storage.

The app shows a reference for unexpected storage errors. Search the runtime logs for that reference; the log includes the database backend, failed operation and error category without the URI or case contents. See [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

## Enable AI evidence analysis

For NVIDIA NIM, add `AI_PROVIDER=nvidia` and `NVIDIA_API_KEY` as server-side variables in the intended Vercel environment, then redeploy. Use `AI_PUBLIC_DEMO=true` only if judges should be able to run AI on the fictional case. See the [provider setup and smoke test](ai-evidence-review.md).

## Verify the deployed submission

1. Open `/demo/review` in a fresh browser session. Inspect citations, accept a claim, and verify the downloaded ZIP opens as PDF and JSON.
2. If Sandbox access is enabled, unlock `/sandbox`. Create and approve a Sandbox test order, capture it after returning, and import the sample documents from the [workspace guide](paypal-sandbox-workspace.md). Reopen the case from **Recent cases** and verify the draft download. If storage is unavailable, check the environment selection, the Atlas URI and database name, and network access. `/api/health` checks only the app process.
3. Open the exact submission URL in a signed-out browser and verify that judges can reach the synthetic demo. Keep Sandbox credentials, the workspace key and case data private.

To run the storage integration test locally, point `MONGODB_TEST_URI` at a disposable MongoDB server and run `npm test`. The test creates and removes a uniquely named test database and stubs the PayPal calls.
