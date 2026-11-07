import { createHash, randomUUID } from "node:crypto";
import { asRecord, PaymentImportError, validateCaptureId } from "./payment.ts";
import { sandboxClient, type SandboxCredentials } from "./sandbox.ts";

const reference = "PAYPAL_REC_SANDBOX_TEST";
const testAmount = { currency_code: "USD", value: "10.00" };
const returnPage = "http://localhost:3000/sandbox/checkout-return";

function orderId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Z0-9]{1,36}$/.test(value)) {
    throw new PaymentImportError("Supply a valid PayPal Sandbox order ID.");
  }
  return value;
}

function hasTestAmount(value: unknown) {
  const amount = asRecord(value);
  return amount.currency_code === testAmount.currency_code && amount.value === testAmount.value;
}

function approvalUrl(value: unknown, id: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname) &&
      !url.port && !url.username && !url.password && url.pathname === "/checkoutnow" &&
      url.searchParams.get("token") === id ? url.href : null;
  } catch {
    return null;
  }
}

function captureSummary(order: Record<string, unknown>, id: string) {
  const unit = Array.isArray(order.purchase_units) && order.purchase_units.length === 1
    ? asRecord(order.purchase_units[0]) : {};
  const captures = asRecord(unit.payments).captures;
  const capture = Array.isArray(captures) && captures.length === 1 ? asRecord(captures[0]) : {};
  if (order.id !== id || order.status !== "COMPLETED" || capture.status !== "COMPLETED" || !hasTestAmount(capture.amount)) {
    throw new PaymentImportError("PayPal did not return a completed USD 10.00 capture. Check this order again before importing.");
  }
  return {
    source: "paypal_sandbox", status: "COMPLETED", order_id: id,
    capture_id: validateCaptureId(capture.id),
    amount: { currency: testAmount.currency_code, value: testAmount.value },
  };
}

function jsonHeaders(requestId: string) {
  return { "Content-Type": "application/json", "PayPal-Request-Id": requestId, Prefer: "return=representation" };
}

export async function createTestOrder(credentials: SandboxCredentials, fetcher: typeof fetch = fetch) {
  const request = await sandboxClient(credentials, fetcher);
  const order = asRecord(await request("/v2/checkout/orders", {
    method: "POST",
    headers: jsonHeaders(randomUUID()),
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: reference, description: "PayPal Rec test checkout", amount: testAmount }],
      payment_source: { paypal: { experience_context: {
        shipping_preference: "NO_SHIPPING",
        return_url: returnPage,
        cancel_url: `${returnPage}?cancelled=1`,
      } } },
    }),
  }, "test order creation"));
  const id = orderId(order.id);
  const links = Array.isArray(order.links) ? order.links.map(asRecord) : [];
  const approve = links.flatMap(({ rel, href }) => {
    const url = rel === "payer-action" || rel === "approve" ? approvalUrl(href, id) : null;
    return url ? [url] : [];
  })[0];
  if (!approve) throw new PaymentImportError("PayPal did not return a usable Sandbox approval link.");
  return {
    source: "paypal_sandbox", order_id: id, approval_url: approve,
    amount: { currency: testAmount.currency_code, value: testAmount.value },
  };
}

export async function captureTestOrder(idValue: string, credentials: SandboxCredentials, fetcher: typeof fetch = fetch) {
  const id = orderId(idValue);
  const request = await sandboxClient(credentials, fetcher);
  const path = `/v2/checkout/orders/${id}`;
  const order = asRecord(await request(path, { method: "GET" }, "test order lookup"));
  const unit = Array.isArray(order.purchase_units) && order.purchase_units.length === 1
    ? asRecord(order.purchase_units[0]) : {};
  if (order.id !== id || order.intent !== "CAPTURE" || unit.reference_id !== reference || !hasTestAmount(unit.amount)) {
    throw new PaymentImportError("This is not a USD 10.00 Sandbox order created by this helper.");
  }
  if (order.status === "COMPLETED") return captureSummary(order, id);
  if (order.status !== "APPROVED") {
    throw new PaymentImportError("The test order is not approved yet. Open its approval link and approve it as a Sandbox buyer.");
  }
  const requestId = createHash("sha256").update(`paypal-rec-sandbox-capture:${id}`).digest("hex").slice(0, 36);
  const captured = asRecord(await request(`${path}/capture`, {
    method: "POST", headers: jsonHeaders(requestId), body: "{}",
  }, "test order capture"));
  return captureSummary(captured, id);
}
