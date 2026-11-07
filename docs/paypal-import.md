# Import a PayPal payment

Run these commands from the repository root after `npm ci`. Preview mode prints the source label, exact amount, currency, capture ID, status and timestamp. It makes no database writes.

## Demo replay

```sh
npm run paypal:import -- --replay
```

The output should say `Fixture replay · simulated payment` and show `DEMO-PP-CAPTURE-001` for `2400.00 USD`. This mode reads the checked-in fixture and never calls PayPal. The same payment is visible at `/demo/payment` when the app is running.

## Sandbox smoke test

Use an existing **capture ID** from the same Sandbox merchant that owns the app credentials. An order ID is not a capture ID. Copy `.env.example` to `.env.local` and fill `PAYPAL_SANDBOX_CLIENT_ID` and `PAYPAL_SANDBOX_CLIENT_SECRET`, or supply the variables through your shell. Keep credentials out of Git and chat.

```sh
npm run paypal:import -- --sandbox "$SANDBOX_CAPTURE_ID"
```

Compare the printed ID, amount, currency and timestamp with the sandbox capture. The adapter uses the [Sandbox token endpoint](https://developer.paypal.com/api/rest/authentication/) and [Payments v2 capture lookup](https://developer.paypal.com/docs/api/payments/v2/#captures_get). The timestamp is the capture record's `create_time`. Payer and payee are left unknown for a Sandbox capture; this command does not fetch order data or infer those identities. A Sandbox failure exits with an error and never falls back to the fixture. The command only reads captures; it cannot create or refund a payment.

## Store the payment as case evidence

Apply the [case and evidence migration](../db/README.md), create a test case, and set `DATABASE_URL` in `.env.local` or your shell. Give the operator CLI the case UUID and the merchant key stored on that case:

```sh
# In a disposable database with DATABASE_URL exported, create a case and copy its returned UUID.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ('demo-merchant', 'DEMO-AGENCY-001') RETURNING case_id;"
```

Set `CASE_UUID` to the returned value and `MERCHANT_KEY` to `demo-merchant` for this example. Then run one of:

```sh
npm run paypal:import -- --replay --case "$CASE_UUID" --merchant "$MERCHANT_KEY"
npm run paypal:import -- --sandbox "$SANDBOX_CAPTURE_ID" --case "$CASE_UUID" --merchant "$MERCHANT_KEY"
```

Use the mode that matches the case you are testing. Replay stores source `SRC-02` with origin `synthetic_replay`. Sandbox stores `PAYPAL-CAPTURE-<id>` with origin `paypal_sandbox`. Both store a normalized JSON snapshot for citations such as `/transaction_id` and `/amount/value`. An identical rerun reports `already_imported`; changed data for the same source is rejected to preserve any existing citations.

Sandbox import is a local operator command. There is no public write route or Sandbox credential handling in the demo page.
