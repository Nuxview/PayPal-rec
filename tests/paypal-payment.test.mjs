import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../fixtures/restriction-agency-v1/inputs/manifest.json" with { type: "json" };
import { loadReplayPayment } from "../lib/paypal/replay.ts";
import { loadSandboxPayment } from "../lib/paypal/sandbox.ts";

const captureId = "3C679366HH908993F";
const credentials = { clientId: "test-client", clientSecret: "test-secret" };
const capture = {
  id: captureId,
  status: "COMPLETED",
  amount: { value: "2400.00", currency_code: "USD" },
  create_time: "2026-10-22T15:04:00Z",
};

test("agency replay preserves the fixture ID, amount, parties and provenance", () => {
  assert.equal(manifest.sources.find(({ id }) => id === "SRC-02").path, "paypal-payment.json");
  const payment = loadReplayPayment();
  assert.equal(payment.source_mode, "synthetic_replay");
  assert.equal(payment.transaction_id, "DEMO-PP-CAPTURE-001");
  assert.deepEqual(payment.amount, { value: "2400.00", currency: "USD" });
  assert.equal(payment.payer.name, "Kestrel Grove Finance");
  assert.equal(payment.payee.name, "Cedar Quay Design Studio");
});

test("Sandbox uses OAuth then a read-only capture lookup and preserves the decimal string", async () => {
  const requests = [];
  const payment = await loadSandboxPayment(captureId, credentials, async (url, options) => {
    requests.push({ url, options });
    return Response.json(requests.length === 1 ? { access_token: "sandbox-token" } : capture);
  });
  assert.deepEqual(requests.map(({ url, options }) => [url, options.method]), [
    ["https://api-m.sandbox.paypal.com/v1/oauth2/token", "POST"],
    [`https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`, "GET"],
  ]);
  assert.equal(requests[0].options.body, "grant_type=client_credentials");
  assert.equal(requests[0].options.headers.Authorization, "Basic dGVzdC1jbGllbnQ6dGVzdC1zZWNyZXQ=");
  assert.equal(new Headers(requests[1].options.headers).get("Authorization"), "Bearer sandbox-token");
  assert.ok(requests.every(({ options }) => options.redirect === "error" && options.cache === "no-store"));
  assert.equal(payment.transaction_id, captureId);
  assert.deepEqual(payment.amount, { value: "2400.00", currency: "USD" });
  assert.equal(payment.captured_at, capture.create_time);
  assert.equal(payment.capture_status, capture.status);
  assert.equal(payment.source_mode, "paypal_sandbox");
  assert.equal(payment.payer, null);
  assert.equal(payment.payee, null);
});

test("invalid capture IDs and missing credentials fail before a request", async () => {
  const unusedFetch = () => assert.fail("No network request expected");
  await assert.rejects(loadSandboxPayment("../escape", credentials, unusedFetch), /capture ID/);
  await assert.rejects(loadSandboxPayment("DEMO-PP-CAPTURE-001", credentials, unusedFetch), /capture ID/);
  await assert.rejects(loadSandboxPayment(captureId, {}, unusedFetch), /PAYPAL_SANDBOX_CLIENT_ID/);
});

test("Sandbox authentication and capture errors do not leak the body or return the fixture", async () => {
  const unauthorized = () => new Response("sensitive provider response", { status: 401 });
  await assert.rejects(loadSandboxPayment(captureId, credentials, unauthorized),
    { message: "PayPal Sandbox authentication failed (HTTP 401)." });
  const missing = (url) => url.endsWith("/token")
    ? Response.json({ access_token: "sandbox-token" })
    : new Response("sensitive provider response", { status: 404 });
  await assert.rejects(loadSandboxPayment(captureId, credentials, missing),
    { message: "PayPal Sandbox capture lookup failed (HTTP 404)." });
});

test("Sandbox rejects a mismatched ID or numeric amount", async () => {
  const fetchCapture = (record) => (url) => Response.json(
    url.endsWith("/token") ? { access_token: "sandbox-token" } : record,
  );
  await assert.rejects(loadSandboxPayment(captureId, credentials, fetchCapture({ ...capture, id: "OTHER" })),
    /different capture ID/);
  await assert.rejects(loadSandboxPayment(captureId, credentials, fetchCapture({
    ...capture, amount: { value: 2400, currency_code: "USD" },
  })), /missing or invalid/);
});
