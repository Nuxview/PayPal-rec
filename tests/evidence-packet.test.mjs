import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import PDFDocument from "pdfkit";
import { POST } from "../app/api/demo/reviewed-packet/route.ts";
import { loadAgencyFixture } from "../lib/evidence/agency-fixture.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../lib/evidence/packet-archive.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { writeReviewDecision } from "../lib/evidence/review-state.ts";

const loadReview = async () => buildReviewSnapshot(await loadAgencyFixture());

function request(raw) {
  return new Request("http://localhost/api/demo/reviewed-packet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: raw,
  });
}

test("packet route includes only accepted claims with citations and keeps gaps explicit", async () => {
  const review = await loadReview();
  const [allocation, firstDelivery, secondDelivery] = review.proposals;
  let saved = writeReviewDecision(null, review, allocation.id, "accepted");
  saved = writeReviewDecision(saved, review, firstDelivery.id, "rejected");
  const selection = { ...JSON.parse(saved), accepted_claims: [{ statement: "Untrusted claim" }] };
  const response = await POST(request(JSON.stringify(selection)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="paypal-rec-reviewed-evidence\.zip"$/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(Object.keys(files).sort(), ["reviewed-evidence.json", "reviewed-evidence.pdf"]);
  assert.equal(strFromU8(files["reviewed-evidence.pdf"].subarray(0, 5)), "%PDF-");
  const raw = strFromU8(files["reviewed-evidence.json"]);
  const packet = JSON.parse(raw);
  assert.equal(packet.mode, "synthetic_replay");
  assert.equal(packet.review_version, review.version);
  assert.deepEqual(packet.accepted_claims, [allocation]);
  assert.ok(packet.accepted_claims[0].citations.some(({ sourceId, location }) => sourceId === "SRC-02" && location === "/amount"));
  assert.deepEqual(packet.gaps.map(({ request, status }) => [request, status]), [
    ["R2", "review_required"], ["R3", "missing_evidence"],
  ]);
  assert.match(packet.gaps[1].title, /D3/);
  assert.ok(packet.gaps.every(({ next_evidence }) => next_evidence.length > 0));
  assert.deepEqual(packet.omitted_proposals, [
    { request: firstDelivery.request, title: firstDelivery.title, status: "rejected" },
    { request: secondDelivery.request, title: secondDelivery.title, status: "pending" },
  ]);
  assert.ok(!raw.includes("Untrusted claim") && !raw.includes("SRC-10") && !raw.includes("handoff-20261030"));
  assert.ok(!raw.includes(firstDelivery.statement) && !raw.includes(secondDelivery.statement));
});

test("packet route rejects stale, forged, empty and oversized selections", async () => {
  const review = await loadReview();
  const id = review.proposals[0].id;
  const cases = [
    [JSON.stringify({ version: "old", decisions: { [id]: "accepted" } }), 409],
    [JSON.stringify({ version: review.version, decisions: { [review.followUp[0].id]: "accepted" } }), 400],
    [JSON.stringify({ version: review.version, decisions: { [id]: "pending" } }), 400],
    [JSON.stringify({ version: review.version, decisions: { [id]: "rejected" } }), 422],
    ["{", 400],
    [" ".repeat(16 * 1024 + 1), 413],
  ];
  for (const [raw, status] of cases) {
    const response = await POST(request(raw));
    assert.equal(response.status, status);
    assert.ok((await response.json()).error);
  }
});

test("a proposal without citations cannot enter the packet", async () => {
  const review = await loadReview();
  const id = review.proposals[0].id;
  review.proposals[0].citations = [];
  assert.throws(() => buildEvidencePacket(review, { version: review.version, decisions: { [id]: "accepted" } }),
    /missing its citations/);
});

test("PDF groups each claim's sources, preserves every excerpt and labels continued groups", async (t) => {
  const rendered = [];
  const original = PDFDocument.prototype.text;
  t.mock.method(PDFDocument.prototype, "text", function (value, ...options) {
    rendered.push(value);
    return original.call(this, value, ...options);
  });
  const review = await loadReview();
  const packet = buildEvidencePacket(review, {
    version: review.version,
    decisions: Object.fromEntries(review.proposals.map(({ id }) => [id, "accepted"])),
  });
  const files = unzipSync(await createPacketArchive(packet));
  assert.deepEqual(JSON.parse(strFromU8(files["reviewed-evidence.json"])), packet);
  for (const [index, claim] of packet.accepted_claims.entries()) {
    const start = rendered.indexOf(claim.statement) + 1;
    const next = packet.accepted_claims[index + 1];
    const end = rendered.indexOf(next ? `${next.request}  |  ${next.title}` : "Open gaps");
    const expected = [];
    for (const id of new Set(claim.citations.map(({ sourceId }) => sourceId))) {
      const citations = claim.citations.filter(({ sourceId }) => sourceId === id);
      expected.push(`${id}  |  ${citations[0].name}`);
      for (const citation of citations) {
        expected.push(citation.location, citation.lines
          ? citation.lines.map(({ number, text }) => `${number}: ${text}`).join("\n") : citation.value ?? "");
      }
    }
    assert.deepEqual(rendered.slice(start, end).filter((text) => !text.endsWith(" (continued)")), expected);
  }

  rendered.length = 0;
  const claim = packet.accepted_claims[0];
  const citations = Array.from({ length: 45 }, (_, index) => ({
    ...claim.citations[0], location: `Line ${index + 1}`,
    lines: [{ number: index + 1, text: `Evidence excerpt ${index + 1}` }], value: null,
  }));
  await createPacketArchive({ ...packet, accepted_claims: [{ ...claim, citations }] });
  assert.ok(rendered.includes(`${citations[0].sourceId}  |  ${citations[0].name} (continued)`));
  for (const citation of citations) {
    assert.ok(rendered.includes(citation.location));
    assert.ok(rendered.includes(`${citation.lines[0].number}: ${citation.lines[0].text}`));
  }
});

test("native download forms return the selected ZIP and redirect stale reviews with feedback", async () => {
  const review = await loadReview();
  const [proposal] = review.proposals;
  const selection = writeReviewDecision(null, review, proposal.id, "accepted");
  const form = (value) => new Request("http://localhost/api/demo/reviewed-packet", {
    method: "POST",
    body: new URLSearchParams({ review: value }),
  });
  const response = await POST(form(selection));
  assert.equal(response.status, 200);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(JSON.parse(strFromU8(archive["reviewed-evidence.json"])).accepted_claims, [proposal]);

  const stale = await POST(form(JSON.stringify({ ...JSON.parse(selection), version: "old" })));
  assert.equal(stale.status, 303);
  assert.equal(stale.headers.get("location"), "/demo/review?review=changed");
  const empty = await POST(form(JSON.stringify({ version: review.version, decisions: {} })));
  assert.equal(empty.status, 303);
  assert.equal(empty.headers.get("location"), "/demo/review?review=empty");
});
