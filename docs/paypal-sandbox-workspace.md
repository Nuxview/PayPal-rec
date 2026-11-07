# PayPal Sandbox workspace

This is a private, single-operator workspace for local testing. It reads existing captures from PayPal Sandbox and stores them with the test notice and supporting documents you supply. It does not create payments, use live credentials, retrieve account limitations, or submit evidence to PayPal.

## Set up locally

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), select **Sandbox** under **Apps & Credentials**. Use the client ID and secret from the Sandbox app associated with the test seller. Use a completed Sandbox capture ID from that seller, or [create a test capture](#create-a-test-capture). If you already completed a different Sandbox checkout, the capture ID appears in `purchase_units[].payments.captures[].id`. An order ID is not a capture ID.
2. Use a local PostgreSQL 16+ database and apply [both migrations](../db/README.md). If you need a disposable database and have Docker:

   ```sh
   docker run --name paypal-rec-sandbox-db -e POSTGRES_PASSWORD=local_test_only \
     -e POSTGRES_DB=paypal_rec -p 127.0.0.1:5434:5432 -d postgres:16
   docker exec paypal-rec-sandbox-db pg_isready -U postgres -d paypal_rec
   docker exec -i paypal-rec-sandbox-db psql -U postgres -d paypal_rec -v ON_ERROR_STOP=1 < db/migrations/001_case_evidence.sql
   docker exec -i paypal-rec-sandbox-db psql -U postgres -d paypal_rec -v ON_ERROR_STOP=1 < db/migrations/002_restriction_notice.sql
   ```

   Run the migration commands once, after `pg_isready` reports that the server accepts connections. The example database URL is `postgresql://postgres:local_test_only@127.0.0.1:5434/paypal_rec`.
3. Copy `.env.example` to `.env.local`. Set `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, and `DATABASE_URL`. Generate a separate `PAYPAL_SANDBOX_WEB_KEY` with `openssl rand -hex 32`. Keep both secrets in your local environment.
4. Run `npm ci` and `npm run dev -- --hostname 127.0.0.1`. Open [127.0.0.1:3000/sandbox](http://127.0.0.1:3000/sandbox), unlock it with the workspace key, enter your capture ID, and upload the notice and supporting `.txt` files. A linked Checkout order ID is optional; it supplies payer data only if the order contains the same capture and amount.
5. Inspect the cited proposals and gaps, accept supported proposals, then download the reviewed ZIP. Reloading a stored case uses its imported snapshots and does not call PayPal again.

You can check just the PayPal connection before setting up PostgreSQL with `npm run paypal:import -- --sandbox "$SANDBOX_CAPTURE_ID"`. A failed lookup never switches to fixture replay.

## Create a test capture

With the Sandbox client ID and secret in `.env.local`, start `npm run dev` on port 3000 if you want the local return page to load. In a second terminal:

```sh
npm run paypal:checkout -- create
```

Open the printed `approval_url`. Sign in as a **Sandbox Personal buyer** from [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts/), different from the seller account tied to the app, and approve the USD 10.00 test order. The approval page uses Sandbox funds only. The return page does not capture the order. After approval, pass the printed `order_id` to the capture command:

```sh
npm run paypal:checkout -- capture YOUR_ORDER_ID
```

Copy the resulting `capture_id` into the workspace, or preview it with `npm run paypal:import -- --sandbox YOUR_CAPTURE_ID`. Keep the `order_id` for the optional payer lookup. No database is needed for these commands. Repeating capture for a completed helper order returns its existing capture ID.

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
