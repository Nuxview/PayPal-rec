import assert from "node:assert/strict";
import test from "node:test";
import { captureTestOrder, createTestOrder } from "../lib/paypal/test-checkout.ts";

const credentials = { clientId: "sandbox-test", clientSecret: "mock-secret" };
const id = "4U2394441N253672E";
const captureId = "3C679366HH908993F";
const approval = `https://www.sandbox.paypal.com/checkoutnow?token=${id}`;
const amount = { currency_code: "USD", value: "10.00" };
const unit = { reference_id: "PAYPAL_REC_SANDBOX_TEST", amount };
const approved = { id, intent: "CAPTURE", status: "APPROVED", purchase_units: [unit] };
const completed = { ...approved, status: "COMPLETED",
  purchase_units: [{ ...unit, payments: { captures: [{ id: captureId, status: "COMPLETED", amount }] } }] };

function provider({ created = { id, links: [{ rel: "payer-action", href: approval }] },
  order = approved, captured = completed } = {}) {
  const requests = [];
  const fetcher = async (href, options) => {
    const url = new URL(href);
    assert.equal(url.origin, "https://api-m.sandbox.paypal.com");
    requests.push({ path: url.pathname, ...options });
    if (url.pathname === "/v1/oauth2/token") return Response.json({ access_token: "test-token" });
    if (url.pathname === "/v2/checkout/orders" && options.method === "POST") return Response.json(created, { status: 201 });
    if (url.pathname === `/v2/checkout/orders/${id}` && options.method === "GET") return Response.json(order);
    if (url.pathname === `/v2/checkout/orders/${id}/capture` && options.method === "POST") return Response.json(captured, { status: 201 });
    assert.fail("Unexpected Sandbox request");
  };
  return { fetcher, requests };
}

test("creates a $10 Sandbox order and returns the approval link without capturing", async () => {
  const mock = provider();
  assert.deepEqual(await createTestOrder(credentials, mock.fetcher), {
    source: "paypal_sandbox", order_id: id, approval_url: approval, amount: { currency: "USD", value: "10.00" },
  });
  assert.deepEqual(mock.requests.map(({ method, path }) => [method, path]), [
    ["POST", "/v1/oauth2/token"], ["POST", "/v2/checkout/orders"],
  ]);
  const order = JSON.parse(mock.requests[1].body);
  assert.equal(order.intent, "CAPTURE");
  assert.deepEqual(order.purchase_units[0].amount, amount);
  assert.equal(order.purchase_units[0].reference_id, unit.reference_id);
  assert.equal(new Headers(mock.requests[1].headers).get("authorization"), "Bearer test-token");
});

test("rejects a live, spoofed, or mismatched approval link", async () => {
  for (const href of [
    approval.replace("www.sandbox.paypal.com", "www.paypal.com"),
    approval.replace("www.sandbox.paypal.com", "www.sandbox.paypal.com.example.test"),
    approval.replace(id, "OTHER"),
  ]) {
    const { fetcher } = provider({ created: { id, links: [{ rel: "approve", href }] } });
    await assert.rejects(createTestOrder(credentials, fetcher), /usable Sandbox approval link/);
  }
});

test("only captures an approved helper order and returns the nested capture ID", async () => {
  const mock = provider();
  const result = await captureTestOrder(id, credentials, mock.fetcher);
  assert.deepEqual(result, {
    source: "paypal_sandbox", order_id: id, capture_id: captureId, status: "COMPLETED",
    amount: { currency: "USD", value: "10.00" },
  });
  assert.deepEqual(mock.requests.map(({ method }) => method), ["POST", "GET", "POST"]);
  const other = provider();
  await captureTestOrder(id, credentials, other.fetcher);
  assert.equal(new Headers(mock.requests.at(-1).headers).get("PayPal-Request-Id"),
    new Headers(other.requests.at(-1).headers).get("PayPal-Request-Id"));
  const replay = provider({ order: completed });
  assert.deepEqual(await captureTestOrder(id, credentials, replay.fetcher), result);
  assert.deepEqual(replay.requests.map(({ method }) => method), ["POST", "GET"]);
});

test("does not capture unapproved or unrelated orders and does not report a pending capture as complete", async () => {
  for (const [order, message] of [
    [{ ...approved, status: "PAYER_ACTION_REQUIRED" }, /not approved yet/],
    [{ ...approved, purchase_units: [{ ...unit, reference_id: "OTHER" }] }, /not a USD 10.00 Sandbox order/],
    [{ ...approved, purchase_units: [{ ...unit, amount: { ...amount, value: "12.00" } }] }, /not a USD 10.00 Sandbox order/],
  ]) {
    const mock = provider({ order });
    await assert.rejects(captureTestOrder(id, credentials, mock.fetcher), message);
    assert.deepEqual(mock.requests.map(({ method }) => method), ["POST", "GET"]);
  }
  const pending = provider({ captured: {
    ...completed, purchase_units: [{ ...unit, payments: { captures: [{ id: captureId, status: "PENDING", amount }] } }],
  } });
  await assert.rejects(captureTestOrder(id, credentials, pending.fetcher), /did not return a completed/);
});
