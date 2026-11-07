import { parseArgs } from "node:util";
import pg from "pg";
import { paymentLabels, PaymentImportError } from "../lib/paypal/payment.ts";
import { loadReplayPayment } from "../lib/paypal/replay.ts";
import { loadSandboxPayment } from "../lib/paypal/sandbox.ts";
import { persistPayment } from "../lib/paypal/store.ts";

const usage = "Usage: npm run paypal:import -- (--replay | --sandbox CAPTURE_ID) [--case CASE_UUID --merchant MERCHANT_KEY]";

async function main() {
  let flags;
  try {
    flags = parseArgs({
      options: {
        replay: { type: "boolean" },
        sandbox: { type: "string" },
        case: { type: "string" },
        merchant: { type: "string" },
      },
    }).values;
  } catch {
    throw new PaymentImportError(usage);
  }
  if (Boolean(flags.replay) === (flags.sandbox !== undefined)) throw new PaymentImportError(usage);

  const caseId = flags.case;
  const merchantKey = flags.merchant;
  const connectionString = process.env.DATABASE_URL;
  if (caseId !== undefined || merchantKey !== undefined) {
    if (!caseId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId) ||
        !merchantKey?.trim()) {
      throw new PaymentImportError("Persistence requires both a case UUID and its merchant key.");
    }
    if (!connectionString?.trim()) throw new PaymentImportError("Set DATABASE_URL to persist the payment.");
  }

  const payment = flags.sandbox !== undefined
    ? await loadSandboxPayment(flags.sandbox, {
        clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID,
        clientSecret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET,
      })
    : loadReplayPayment();

  let saved;
  if (caseId && merchantKey) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
    try {
      await client.connect();
      saved = await persistPayment(client, caseId, merchantKey, payment);
    } finally {
      await client.end().catch(() => {});
    }
  }

  // Do not print credentials, raw PayPal responses or payer contact details.
  console.log(JSON.stringify({
    source_mode: payment.source_mode,
    source_label: paymentLabels[payment.source_mode],
    transaction_id: payment.transaction_id,
    amount: payment.amount,
    capture_status: payment.capture_status,
    captured_at: payment.captured_at,
    result: "preview",
    ...saved,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof PaymentImportError
    ? error.message
    : "Payment import could not complete. Check your local configuration and database connection.");
  process.exitCode = 1;
});
