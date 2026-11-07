import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { strFromU8, unzipSync } from "fflate";
import { loadFixtureDocuments, merchantDocument } from "../lib/evidence/documents.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../lib/evidence/packet-archive.ts";
import { importSandboxCase, listSandboxCases, loadSandboxReview } from "../lib/evidence/sandbox-case.ts";
import { writeReviewDecision } from "../lib/evidence/review-state.ts";
import { hasSandboxSession, openSandboxSession, sandboxConfig, sandboxSessionSeconds } from "../lib/paypal/sandbox-access.ts";
import { loadSandboxPayment } from "../lib/paypal/sandbox.ts";

const captureId = "3C679366HH908993F";
const orderId = "4U2394441N253672E";
const credentials = { clientId: "sandbox-test-client", clientSecret: "sandbox-test-secret" };
const capture = {
  id: captureId, status: "COMPLETED", create_time: "2026-10-22T15:04:00Z",
  amount: { currency_code: "USD", value: "2400.00" },
};
const order = {
  id: orderId,
  purchase_units: [{ payments: { captures: [capture] } }],
  payment_source: { paypal: { name: { given_name: "Kestrel", surname: "Grove Finance" } } },
};

function mockPayPal({ orderPayload = order, captureStatus = 200 } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push([url, options.method]);
    if (url.endsWith("/oauth2/token")) return Response.json({ access_token: "test-token" });
    if (url.endsWith(`/captures/${captureId}`)) return Response.json(capture, { status: captureStatus });
    if (url.endsWith(`/orders/${orderId}`)) return Response.json(orderPayload);
    assert.fail("Unexpected Sandbox request");
  };
  return { fetcher, requests };
}

test("workspace access requires configuration and rejects forged or expired sessions", () => {
  const key = "a".repeat(40);
  const env = { PAYPAL_SANDBOX_WEB_KEY: key, DATABASE_URL: "postgresql://example/db",
    PAYPAL_SANDBOX_CLIENT_ID: credentials.clientId, PAYPAL_SANDBOX_CLIENT_SECRET: credentials.clientSecret };
  assert.ok(sandboxConfig(env));
  assert.equal(sandboxConfig({ ...env, PAYPAL_SANDBOX_WEB_KEY: "short" }), null);
  assert.equal(sandboxConfig({ ...env, DATABASE_URL: "" }), null);
  const now = 1_800_000_000_000;
  assert.equal(openSandboxSession(key, "wrong", now), null);
  const token = openSandboxSession(key, key, now);
  assert.ok(hasSandboxSession(key, token, now));
  assert.ok(!hasSandboxSession(key, token + "x", now));
  assert.ok(!hasSandboxSession("b".repeat(40), token, now));
  assert.ok(!hasSandboxSession(key, token, now + sandboxSessionSeconds * 1000));
});

test("payer lookup requires the linked order and exact capture amount", async () => {
  const opts = { ...credentials, orderId };
  const { fetcher, requests } = mockPayPal();
  const payment = await loadSandboxPayment(captureId, opts, fetcher);
  assert.deepEqual(payment.payer, { name: "Kestrel Grove Finance", email: null });
  assert.deepEqual(requests, [
    ["https://api-m.sandbox.paypal.com/v1/oauth2/token", "POST"],
    [`https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`, "GET"],
    [`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`, "GET"],
  ]);
  const wrongAmount = mockPayPal({ orderPayload: { ...order, purchase_units: [{
    payments: { captures: [{ ...capture, amount: { currency_code: "USD", value: "2400.01" } }] },
  }] } });
  await assert.rejects(loadSandboxPayment(captureId, opts, wrongAmount.fetcher), /does not confirm this capture and amount/);
  const noLink = mockPayPal({ orderPayload: { ...order, purchase_units: [] } });
  await assert.rejects(loadSandboxPayment(captureId, opts, noLink.fetcher), /does not confirm this capture and amount/);
});

test("Sandbox lookup, case import, review and export use only the submitted case evidence", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const name of ["001_case_evidence.sql", "002_restriction_notice.sql"]) {
    await db.exec(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"));
  }
  const fixture = await loadFixtureDocuments();
  const uploaded = fixture.map((doc) => merchantDocument(doc.source_name,
    Buffer.from(doc.source_content.replaceAll("DEMO-PP-CAPTURE-001", captureId))));
  const [notice, ...documents] = uploaded;
  const input = { captureId, orderId, notice, documents };
  await assert.rejects(importSandboxCase(db, { ...input, notice: fixture[0] }, credentials, () => {
    assert.fail("Synthetic fixture should not reach Sandbox");
  }), /Only documents supplied/);
  const missing = mockPayPal({ captureStatus: 404 });
  await assert.rejects(importSandboxCase(db, input, credentials, missing.fetcher), /capture lookup failed/);
  assert.deepEqual(await listSandboxCases(db), []);
  const invalid = { ...notice, source_content: "" };
  await assert.rejects(importSandboxCase(db, { ...input, notice: invalid }, credentials, mockPayPal().fetcher),
    { code: "23514" });
  assert.deepEqual(await listSandboxCases(db), [], "A failed insert should not leave a partial case");

  const api = mockPayPal();
  const id = await importSandboxCase(db, input, credentials, api.fetcher);
  assert.deepEqual(await listSandboxCases(db), [{ id, label: `Sandbox ${captureId}` }]);
  const { review, payment, notice: captured } = await loadSandboxReview(db, id);
  assert.equal(payment.transaction_id, captureId);
  assert.equal(review.mode, "paypal_sandbox");
  assert.equal(review.amount, "USD 2400.00");
  assert.deepEqual(captured.requests.map(({ label }) => label), ["R1", "R2", "R3"]);
  assert.equal(review.proposals.length, 3);
  assert.ok(review.followUp.some(({ title }) => title === "Payer mismatch"));
  assert.equal(review.excluded.length, 1);
  const [allocation] = review.proposals;
  assert.ok(allocation.citations.some(({ sourceId, location }) =>
    sourceId === `PAYPAL-CAPTURE-${captureId}` && location === "/amount"));
  const selection = JSON.parse(writeReviewDecision(null, review, allocation.id, "accepted"));
  const files = unzipSync(await createPacketArchive(buildEvidencePacket(review, selection)));
  const packet = JSON.parse(strFromU8(files["reviewed-evidence.json"]));
  assert.equal(packet.mode, "paypal_sandbox");
  assert.equal(packet.capture_id, captureId);
  assert.deepEqual(packet.accepted_claims.map(({ id }) => id), [allocation.id]);
  assert.equal(strFromU8(files["reviewed-evidence.pdf"].subarray(0, 5)), "%PDF-");
  assert.equal(api.requests.length, 3, "Review and export must reuse the stored capture");

  const other = await importSandboxCase(db, input, credentials, mockPayPal().fetcher);
  const otherReview = (await loadSandboxReview(db, other)).review;
  assert.throws(() => buildEvidencePacket(otherReview, selection), { status: 409 });
});
