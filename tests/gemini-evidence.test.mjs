import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvidenceGaps, buildGapContext, geminiConfig, publicGeminiEnabled } from "../lib/ai/gemini-evidence.ts";
import { loadAgencyFixture } from "../lib/evidence/agency-fixture.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";

const fixture = await loadAgencyFixture();
const noticeSource = fixture.sources.find(({ source_id }) => source_id === fixture.report.notice_source_id);
const review = buildReviewSnapshot(fixture);
const notice = parseRestrictionNotice(noticeSource.source_id, noticeSource.source_content);
const config = geminiConfig({ GEMINI_API_KEY: "test-server-key" });
const buildContext = (sources = fixture.sources, parsed = notice) =>
  buildGapContext(sources, parsed, fixture.report.payment_source_id, fixture.payment, review);

function reply(findings, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { parts: [
    { thought: true, text: "Hidden reasoning is not part of the result." },
    { text: JSON.stringify({ findings }) },
  ] } }] });
}

const gap = {
  request: "R3", status: "missing", title: "D3 receipt is missing",
  observation: "The records reviewed do not establish that the client received the D3 social launch kit.",
  nextStep: "Ask the client to confirm receipt of the NL-17 social launch kit in writing.",
  excerptIds: ["E1"],
};

test("analysis includes unclassified evidence and returns only server-resolved source excerpts", async () => {
  const unclassified = {
    source_id: "DOC-extra", source_kind: "merchant_document", source_origin: "merchant_provided",
    source_name: "delivery-update.txt", source_content: "Delivery report\r\n\r\nThe team sent an asset but did not receive confirmation.",
  };
  const context = buildContext([...fixture.sources, unclassified]);
  const additional = context.excerpts.find(({ sourceName }) => sourceName === unclassified.source_name);
  assert.ok(additional);
  const before = buildEvidencePacket(review, { version: review.version, decisions: { [review.proposals[0].id]: "accepted" } });
  const result = await analyzeEvidenceGaps(context, config, async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(init.headers["x-goog-api-key"], config.apiKey);
    assert.equal(init.redirect, "error");
    const body = JSON.parse(init.body);
    const submitted = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.match(body.systemInstruction.parts[0].text, /untrusted case data/);
    assert.ok(submitted.excerpts.some(({ text }) => text.includes("did not receive confirmation")));
    assert.equal(submitted.payment.captureId, fixture.payment.transaction_id);
    assert.ok(!Object.hasOwn(submitted.payment, "payerEmail"));
    assert.ok(!init.body.includes(config.apiKey));
    return reply([{ ...gap, excerptIds: ["E1", additional.id], excerpt: "fabricated quotation" }]);
  });
  const { excerpts, ...finding } = result.findings[0];
  const { excerptIds, ...expected } = gap;
  assert.deepEqual(finding, expected);
  assert.deepEqual(excerpts, [context.excerpts.find(({ id }) => id === excerptIds[0]), additional]);
  assert.equal(excerpts[1].end, 3);
  assert.deepEqual(buildEvidencePacket(review, { version: review.version, decisions: { [review.proposals[0].id]: "accepted" } }), before);
});

test("rejects unknown requests, invented references, malformed or incomplete output", async () => {
  const context = buildContext();
  for (const finding of [
    { ...gap, request: "R99" }, { ...gap, request: "NOTICE" }, { ...gap, excerptIds: ["made-up"] },
    { ...gap, excerptIds: [] }, { ...gap, status: "approved" }, { ...gap, nextStep: "" },
  ]) {
    await assert.rejects(analyzeEvidenceGaps(context, config, async () => reply([finding])), /could not be verified/);
  }
  await assert.rejects(analyzeEvidenceGaps(context, config, async () => reply([gap], "MAX_TOKENS")), /complete analysis/);
  await assert.rejects(analyzeEvidenceGaps(context, config, async () => Response.json({ candidates: [] })), /complete analysis/);
});

test("bounds oversized inputs and lets the reviewer flag unresolved notice text", async () => {
  const lines = "Requested documents:\nThis free-form instruction needs clarification.\n" + "A".repeat(90_000);
  const sources = fixture.sources.map((source) => source.source_id === noticeSource.source_id
    ? { ...source, source_content: lines } : source);
  const context = buildContext(sources, parseRestrictionNotice(noticeSource.source_id, lines));
  assert.equal(context.limited, true);
  assert.deepEqual(context.notice.unresolvedLines, [2]);
  assert.ok(context.excerpts.filter(({ sourceName }) => sourceName === noticeSource.source_name)
    .every(({ text }) => text.length <= 1000));
  const result = await analyzeEvidenceGaps(context, config, async () => reply([{ ...gap, request: "NOTICE" }]));
  assert.equal(result.limited, true);
  assert.equal(result.findings[0].request, "NOTICE");
});

test("Gemini is explicitly enabled for the public fixture and provider failures do not leak response data", async () => {
  assert.equal(publicGeminiEnabled({ GEMINI_API_KEY: "test-server-key" }), false);
  assert.equal(publicGeminiEnabled({ GEMINI_API_KEY: "test-server-key", GEMINI_PUBLIC_DEMO: "true" }), true);
  assert.equal(geminiConfig({ GEMINI_API_KEY: "test-server-key", GEMINI_MODEL: "https://other.invalid/" }), null);
  await assert.rejects(analyzeEvidenceGaps(buildContext(), config, async () => new Response("internal data", { status: 429 })),
    (error) => error.message.includes("usage limit") && !error.message.includes("internal data"));
});
