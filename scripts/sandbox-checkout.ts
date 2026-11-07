import { PaymentImportError } from "../lib/paypal/payment.ts";
import { captureTestOrder, createTestOrder } from "../lib/paypal/test-checkout.ts";

const usage = "Usage: npm run paypal:checkout -- create | capture ORDER_ID";

async function main() {
  const [command, id, ...extra] = process.argv.slice(2);
  const credentials = {
    clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID,
    clientSecret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET,
  };
  if (command === "create" && id === undefined) {
    console.log(JSON.stringify(await createTestOrder(credentials), null, 2));
  } else if (command === "capture" && id && !extra.length) {
    console.log(JSON.stringify(await captureTestOrder(id, credentials), null, 2));
  } else {
    throw new PaymentImportError(usage);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof PaymentImportError ? error.message : "The Sandbox test checkout could not be completed.");
  process.exitCode = 1;
});
