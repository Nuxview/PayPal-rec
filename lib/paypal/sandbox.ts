import { Buffer } from "node:buffer";
import { asRecord, normalizeCapture, PaymentImportError, validateCaptureId } from "./payment.ts";

const origin = "https://api-m.sandbox.paypal.com";
export type SandboxCredentials = { clientId?: string; clientSecret?: string };

function normalizeDecimal(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`;
}

function payerForCapture(payload: unknown, orderId: string, payment: ReturnType<typeof normalizeCapture>) {
  const order = asRecord(payload);
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const captures = units.flatMap((unit: unknown) => {
    const payments = asRecord(asRecord(unit).payments);
    return Array.isArray(payments.captures) ? payments.captures.map(asRecord) : [];
  }).filter((capture) => capture.id === payment.transaction_id);
  const amount = asRecord(captures[0]?.amount);
  if (order.id !== orderId || captures.length !== 1 || amount.currency_code !== payment.amount.currency ||
    typeof amount.value !== "string" || !/^[0-9]+(?:\.[0-9]+)?$/.test(amount.value) ||
    normalizeDecimal(amount.value) !== normalizeDecimal(payment.amount.value)) {
    throw new PaymentImportError("The Sandbox order does not confirm this capture and amount.");
  }
  const account = asRecord(asRecord(order.payment_source).paypal);
  const legacy = asRecord(order.payer);
  for (const payer of [account, legacy]) {
    const name = asRecord(payer.name);
    const fullName = [name.given_name, name.surname].filter((part): part is string =>
      typeof part === "string" && part.trim().length > 0).map((part) => part.trim()).join(" ");
    if (fullName) return { name: fullName, email: typeof payer.email_address === "string" ? payer.email_address : null };
  }
  return null;
}

async function readJson(
  fetcher: typeof fetch,
  path: string,
  init: RequestInit,
  operation: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(origin + path, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymentImportError(`PayPal Sandbox ${operation} could not be reached.`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new PaymentImportError(`PayPal Sandbox ${operation} failed (HTTP ${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new PaymentImportError(`PayPal Sandbox ${operation} returned invalid JSON.`);
  }
}

export async function sandboxClient({ clientId, clientSecret }: SandboxCredentials, fetcher: typeof fetch = fetch) {
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new PaymentImportError("Set PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const token = asRecord(await readJson(fetcher, "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, "authentication")).access_token;

  if (typeof token !== "string" || !/^[\x21-\x7E]+$/.test(token)) {
    throw new PaymentImportError("PayPal Sandbox did not return a usable access token.");
  }
  return (path: string, init: RequestInit, operation: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    return readJson(fetcher, path, { ...init, headers }, operation);
  };
}

export async function loadSandboxPayment(
  captureId: string,
  { orderId, ...credentials }: SandboxCredentials & { orderId?: string },
  fetcher: typeof fetch = fetch,
) {
  const id = validateCaptureId(captureId);
  if (orderId !== undefined && !/^[A-Z0-9]{1,36}$/i.test(orderId)) {
    throw new PaymentImportError("Supply a valid PayPal Sandbox order ID.");
  }
  const request = await sandboxClient(credentials, fetcher);
  const capture = await request(`/v2/payments/captures/${encodeURIComponent(id)}`, { method: "GET" }, "capture lookup");
  const payment = normalizeCapture(capture, id);
  if (!orderId) return payment;
  const linkedOrder = asRecord(asRecord(asRecord(capture).supplementary_data).related_ids).order_id;
  if (typeof linkedOrder === "string" && linkedOrder !== orderId) {
    throw new PaymentImportError("The capture references a different Sandbox order.");
  }
  const order = await request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, "order lookup");
  return { ...payment, payer: payerForCapture(order, orderId, payment) };
}
