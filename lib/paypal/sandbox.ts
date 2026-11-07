import { Buffer } from "node:buffer";
import { asRecord, normalizeCapture, PaymentImportError, validateCaptureId } from "./payment.ts";

const origin = "https://api-m.sandbox.paypal.com";
type SandboxCredentials = { clientId?: string; clientSecret?: string };

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

export async function loadSandboxPayment(
  captureId: string,
  { clientId, clientSecret }: SandboxCredentials,
  fetcher: typeof fetch = fetch,
) {
  const id = validateCaptureId(captureId);
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
  const capture = await readJson(fetcher, `/v2/payments/captures/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, "capture lookup");
  return normalizeCapture(capture, id);
}
