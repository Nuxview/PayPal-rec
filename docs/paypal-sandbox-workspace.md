# PayPal Sandbox workspace

This private workspace lets you create or look up a Sandbox test payment, add a simulated limitation notice, review cited evidence and download a draft. It uses Sandbox funds. It does not retrieve limitations or submit evidence to PayPal.

Set up the app before recording. Everything from unlocking the workspace through downloading a packet happens in the browser.

For hosting, follow the [Vercel and MongoDB setup](vercel-deployment.md). For a local MongoDB workspace, set `MONGODB_URI` and optionally `MONGODB_DB` in `.env.local`. Skip steps 3 and 4 and the `DATABASE_URL` setting in step 5.

## Set up locally

1. Use Node.js 26 from `.nvmrc` and run `npm ci` from the repository root. Create `.env.local` from `.env.example` if it does not already exist; preserve any existing values.
2. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), select **Sandbox** under **Apps & Credentials**. Put the test seller app's client ID and secret in `PAYPAL_SANDBOX_CLIENT_ID` and `PAYPAL_SANDBOX_CLIENT_SECRET`. Never use live credentials.
3. Start PostgreSQL 16+. For a new disposable Docker database, run this command once:

   ```sh
   docker run --name paypal-rec-sandbox-db -e POSTGRES_PASSWORD=local_test_only \
     -e POSTGRES_DB=paypal_rec -p 127.0.0.1:5434:5432 -d postgres:16
   ```

   In a **separate step**, check readiness:

   ```sh
   docker exec paypal-rec-sandbox-db pg_isready -U postgres -d paypal_rec
   ```

   The container starts asynchronously. An initial failure can mean it is still starting. Wait briefly and repeat the readiness command until it reports **accepting connections**. Do not run migrations before that result. If it keeps failing, inspect `docker logs paypal-rec-sandbox-db`. If the named container already exists, inspect/start it rather than repeating `docker run`.
4. After readiness succeeds, apply each migration once, in order. Run the first command and check that it succeeds before running the second:

   ```sh
   docker exec -i paypal-rec-sandbox-db psql -U postgres -d paypal_rec -v ON_ERROR_STOP=1 < db/migrations/001_case_evidence.sql
   ```

   ```sh
   docker exec -i paypal-rec-sandbox-db psql -U postgres -d paypal_rec -v ON_ERROR_STOP=1 < db/migrations/002_restriction_notice.sql
   ```

   See [database setup](../db/README.md) for the schema and rollback-based smoke test.
5. Set `DATABASE_URL` in `.env.local`. For the Docker example it is `postgresql://postgres:local_test_only@127.0.0.1:5434/paypal_rec`. Generate a separate workspace key with `openssl rand -hex 32` and put it in `PAYPAL_SANDBOX_WEB_KEY`; at least 24 characters are required. Keep these values out of Git.
6. Run `npm run dev -- --hostname 127.0.0.1` and open [localhost:3000/sandbox](http://localhost:3000/sandbox). The browser checkout uses the current loopback address and port by default. If you host the app, set `PAYPAL_SANDBOX_RETURN_ORIGIN` to its public HTTPS origin, such as `https://rec.example.com`. Restart the app after changing environment values.

## Run the presentation in your browser

1. Open **Sandbox** and unlock it with the workspace key.
2. Choose **Sandbox checkout → Create USD 10.00 test order → Open PayPal Sandbox checkout**. Sign in using a separate **Sandbox Personal buyer** from [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts/) and approve the test order. On return, select **Continue to capture → Capture approved order**. The app verifies approval and passes the completed capture into evidence intake. An approved or already completed helper order can also be resumed by entering its order ID. Cancelling on PayPal does not capture it.
3. Alternatively, choose **Existing capture** and look up an already completed capture from the connected Sandbox seller. A linked Checkout order ID is optional; the app uses it for payer data only if it confirms the same capture and amount. The order ID and `PayerID` cannot be used as capture IDs.
4. Upload a simulated notice or paste its text, add supporting `.txt` documents, and select **Build evidence review**. Use the matching test case below for sample content.
5. Inspect citations, accept or reject proposals, and use **Undo** to return a decision to pending. Once you have accepted a proposal, select **Download reviewed packet**. Stored cases can be reopened from **Recent cases**.

The **Demo case** tab offers a separate, clearly labelled synthetic review without Sandbox credentials or a database. A Sandbox lookup failure stays visible and does not load demo data. Developer checkout and import commands are still available for diagnostics; the browser does not require them.

## What does the workspace key do?

`PAYPAL_SANDBOX_WEB_KEY` is a shared access password for this prototype, separate from the PayPal API credentials. The environment value is the server's expected key; entering the same value in the browser proves that you know it. A successful unlock creates an eight-hour browser session granting access to **all** Sandbox cases. You do not supply a different key for each case.

Locking clears the browser's workspace and reviewer sessions. The shared key grants access to the private test workspace. Individual reviewer credentials are required to save decisions, change evidence or remove a MongoDB case. Authorized workspace browsers can view decisions and export current approvals.

## Provision a reviewer

Give each reviewer a unique ID and a separate high-entropy token. Generate 32 random bytes as lowercase hex with `openssl rand -hex 32`. Hash the exact 64-character token with SHA-256, without a trailing newline, and set `SANDBOX_REVIEWERS` to a JSON object such as `{"reviewer-id":"<64-character SHA-256 hex digest>"}`. Send only that reviewer their original token. Replacing or removing their digest invalidates their session. Reviewer sign-in lasts eight hours.

MongoDB records each decision with its reviewer, time, exact statement and citations, and evidence version. Changing or clearing a decision appends to the history. Exports use current server approvals and include the reviewer, time and evidence version in the PDF and JSON. Earlier browser-only Sandbox decisions need to be reviewed again. Local PostgreSQL cases can still be opened for inspection.

## After reviewing and downloading

Read the PDF and its open follow-ups, then gather missing records or clarify unresolved points. The ZIP is a **review draft**, not an automatic PayPal submission or a guarantee that its contents satisfy PayPal's requested formats. For an actual limitation, the merchant submits the requested original records directly in PayPal, following that case's instructions. Sandbox test records are for practice.

Open **Update case evidence** to append supporting text files, withdraw a file, replace the notice or verify the payer against a linked PayPal Sandbox order. To replace a supporting document, select the old file for withdrawal and upload the corrected file in the same save. PayPal must confirm the original capture and amount before the payer is updated.

An evidence change keeps the case ID and creates a new review version. Earlier sources, decisions and exported ZIPs are retained in **Case and review history**. The current case is matched again, changed requests are listed and approvals restart as pending. A no-op upload of identical bytes preserves the current version and decisions. Simultaneous changes require the later reviewer to reload.

**Remove case** archives the case after reviewer sign-in and confirmation. Archived cases disappear from Recent cases and their review and export routes. Their stored evidence and audit records are retained for administrators. The private prototype uses one shared workspace, and all individually provisioned reviewers can edit or archive its cases.

## Supported documents and current limits

Intake accepts one pasted or uploaded notice plus optional supporting documents: **UTF-8 `.txt` only**, up to 25 files including the notice, 256 KiB each and 768 KiB combined. The app does not extract text from PDFs, images or Word documents and has no OCR. The matcher recognizes the specific text formats below; arbitrary text or a generic conversion is not sufficient. Current citations point to the supplied text snapshot, not an original PDF or scan. See [document import](document-import.md).

MongoDB case creation and revisions are atomic. Active documents must fit the intake limits. Each case also has a 12 MiB storage ceiling including its history. A save that would exceed that limit is rejected with the previous state intact.

## Make a matching test case

Use only synthetic documents for Sandbox testing. Replace every `CAPTURE_ID`, amount, currency, buyer, project or email as needed for the test. Keep project IDs, contact details and invoice numbers consistent across the files. The notice is a test document you provide, not a notice issued by PayPal. The matcher recognizes the explicit text shapes below.

**notice.txt**

```text
Payment under review: CAPTURE_ID, USD 10.00
R1: Provide the invoices showing what this payment covered.
R2: Explain the relationship between the payer and the buyer on the invoices.
R3: Provide proof of delivery for each invoiced service.
```

**scope.txt**

```text
Statement of work: LAB-01 | dated 2026-10-15
Client: Test Buyer | contact: buyer@example.test
D1 — Test handoff | USD 10.00 | due 2026-10-23
```

**invoice.txt**

```text
Invoice SB-01 | project LAB-01 | issued 2026-10-20
Bill to: Test Buyer
D1 — Test handoff | USD 10.00
Total due: USD 10.00
```

**allocation.txt**

```text
Date: 2026-10-22
From: buyer@example.test
To: accounts@example.test
Subject: Payment for LAB-01
The PayPal transaction reference is CAPTURE_ID for USD 10.00.
Please apply this payment to invoice SB-01.
```

**receipt.txt**

```text
Date: 2026-10-23
From: buyer@example.test
To: delivery@example.test
Subject: LAB-01 / handoff
We received the test handoff (D1).
```

With matching data, expect an allocation and a receipt. Without `receipt.txt`, delivery stays unconfirmed. Without the order ID or a payer name in the linked order, payer identity stays unknown. The exported packet is labelled **PayPal Sandbox**, and only accepted claims enter it.
