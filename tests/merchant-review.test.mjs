import assert from "node:assert/strict";
import test from "node:test";
import { loadAgencyFixture } from "../lib/evidence/agency-fixture.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { readReviewDecisions, writeReviewDecision } from "../lib/evidence/review-state.ts";

test("review exposes exact evidence and keeps unresolved or excluded items outside the proposal queue", async () => {
  const review = buildReviewSnapshot(await loadAgencyFixture());
  assert.deepEqual(review.proposals.map(({ title }) => title), [
    "Payment allocation", "D1 · Delivery receipt", "D2 · Delivery receipt",
  ]);
  const payment = review.proposals[0];
  assert.deepEqual(payment.citations.find(({ sourceId, location }) => sourceId === "SRC-02" && location === "/amount"), {
    sourceId: "SRC-02",
    name: "paypal-payment.json",
    location: "/amount",
    lines: null,
    value: JSON.stringify({ value: "2400.00", currency: "USD" }, null, 2),
  });
  assert.deepEqual(review.proposals[1].citations.find(({ sourceId, location }) => sourceId === "SRC-06" && location === "Line 5").lines, [
    { number: 5, text: "We received the brand guidelines PDF (D1) and could open it. Thanks." },
  ]);
  assert.deepEqual(review.followUp.map(({ status }) => status), ["review_required", "missing_evidence"]);
  assert.equal(review.excluded[0].sourceId, "SRC-10");
  for (const item of review.followUp) assert.equal(writeReviewDecision(null, review, item.id, "accepted"), null);
});

test("accepting and rejecting change only decisions; stale or malformed records cannot approve a proposal", async () => {
  const fixture = await loadAgencyFixture();
  const original = structuredClone(fixture);
  const review = buildReviewSnapshot(fixture);
  const [payment, delivery] = review.proposals;
  let saved = writeReviewDecision(null, review, payment.id, "accepted");
  saved = writeReviewDecision(saved, review, delivery.id, "rejected");
  assert.deepEqual(readReviewDecisions(saved, review), { [payment.id]: "accepted", [delivery.id]: "rejected" });
  saved = writeReviewDecision(saved, review, payment.id, "rejected");
  assert.equal(readReviewDecisions(saved, review)[payment.id], "rejected");
  assert.deepEqual(fixture, original);
  assert.deepEqual(readReviewDecisions("{", review), {});
  assert.deepEqual(readReviewDecisions(JSON.stringify({ version: review.version, decisions: {
    [payment.id]: "confirmed", unrelated: "accepted", [delivery.id]: "accepted",
  } }), review), { [delivery.id]: "accepted" });

  const revised = buildReviewSnapshot({ ...fixture, sources: fixture.sources.map((source) =>
    source.source_id === "SRC-06" ? { ...source, source_content: source.source_content + "\nUpdated text." } : source,
  ) });
  assert.notEqual(revised.version, review.version);
  assert.deepEqual(readReviewDecisions(saved, revised), {});
});
