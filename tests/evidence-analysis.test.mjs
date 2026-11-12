import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvidenceGaps, buildGapContext, evidenceAIConfig, publicEvidenceAIConfig } from "../lib/ai/evidence-analysis.ts";
import { loadAgencyFixture } from "../lib/evidence/agency-fixture.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";

const fixture = await loadAgencyFixture();
const noticeSource = fixture.sources.find(({ source_id }) => source_id === fixture.report.notice_source_id);
const review = buildReviewSnapshot(fixture);
const notice = parseRestrictionNotice(noticeSource.source_id, noticeSource.source_content);
const config = evidenceAIConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-server-key" });
const nim = evidenceAIConfig({ NVIDIA_API_KEY: "nvapi-test-server-key", GEMINI_API_KEY: "never-use-this-key" });
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
    assert.equal(new Headers(init.headers).get("x-goog-api-key"), config.apiKey);
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

test("NVIDIA is the default; credentials and the old Gemini demo flag cannot switch providers", () => {
  const env = { NVIDIA_API_KEY: "nvidia-key", GEMINI_API_KEY: "gemini-key", GEMINI_PUBLIC_DEMO: "true" };
  assert.equal(evidenceAIConfig(env).provider, "nvidia");
  assert.equal(evidenceAIConfig({ GEMINI_API_KEY: "gemini-key" }), null);
  assert.equal(evidenceAIConfig({ ...env, AI_PROVIDER: "unknown" }), null);
  assert.equal(evidenceAIConfig({ ...env, NVIDIA_NIM_MODEL: "https://other.invalid/" }), null);
  assert.equal(evidenceAIConfig({ ...env, AI_PROVIDER: "gemini", GEMINI_MODEL: "https://other.invalid/" }), null);
  assert.equal(publicEvidenceAIConfig(env), null);
  assert.equal(publicEvidenceAIConfig({ ...env, AI_PUBLIC_DEMO: "true" }).provider, "nvidia");
  assert.equal(publicEvidenceAIConfig({ ...env, AI_PROVIDER: "gemini" }).provider, "gemini");
  assert.equal(publicEvidenceAIConfig({ ...env, AI_PROVIDER: "gemini", AI_PUBLIC_DEMO: "false" }), null);
});

function nimReply(content, finish_reason = "stop") {
  return Response.json({ choices: [{ finish_reason, message: { content } }] });
}

test("NVIDIA receives the existing case context and validates the same evidence references as Gemini", async () => {
  const context = buildContext();
  const result = await analyzeEvidenceGaps(context, nim, async (url, init) => {
    assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer nvapi-test-server-key");
    assert.equal(headers.get("x-goog-api-key"), null);
    const body = JSON.parse(init.body);
    assert.equal(body.model, "meta/llama-3.3-70b-instruct");
    assert.equal(body.stream, false);
    assert.match(body.messages[0].content, /untrusted case data/);
    assert.deepEqual(JSON.parse(body.messages[1].content), context);
    assert.ok(!init.body.includes(nim.apiKey));
    return nimReply("```json\n" + JSON.stringify({ findings: [gap] }) + "\n```");
  });
  assert.equal(result.provider, "nvidia");
  assert.equal(result.model, nim.model);
  assert.deepEqual(result.findings[0].excerpts, [context.excerpts[0]]);
  await assert.rejects(analyzeEvidenceGaps(context, nim, async () => nimReply(JSON.stringify({
    findings: [{ ...gap, excerptIds: ["imaginary"] }],
  }))), /could not be verified/);
  await assert.rejects(analyzeEvidenceGaps(context, nim, async () => nimReply('{"findings":[]}', "length")), /complete analysis/);
});

test("NVIDIA polling keeps the original request on the same provider", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const calls = [];
  const answer = await analyzeEvidenceGaps(buildContext(), nim, async (url, init) => {
    calls.push([url, init.method ?? "GET"]);
    if (calls.length === 1) return new Response(null, { status: 202, headers: { "nvcf-reqid": id } });
    return nimReply('{"findings":[]}');
  });
  assert.deepEqual(answer.findings, []);
  assert.deepEqual(calls, [
    ["https://integrate.api.nvidia.com/v1/chat/completions", "POST"],
    [`https://integrate.api.nvidia.com/v1/status/${id}`, "GET"],
  ]);
});

test("provider quota and billing failures are sanitized and never retry against another provider", async () => {
  for (const [provider, status, message] of [[nim, 429, /usage limit/], [nim, 402, /billing or credits/], [config, 429, /usage limit/]]) {
    const calls = [];
    await assert.rejects(analyzeEvidenceGaps(buildContext(), provider, async (url) => {
      calls.push(url);
      return new Response("internal provider data", { status });
    }), (error) => message.test(error.message) && !error.message.includes("internal provider data"));
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0]).hostname, provider.provider === "nvidia" ? "integrate.api.nvidia.com" : "generativelanguage.googleapis.com");
  }
});
