import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { strFromU8, unzipSync } from "fflate";
import { persistDocuments } from "../lib/evidence/document-store.ts";
import { loadFixtureDocuments } from "../lib/evidence/documents.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";
import { matchCaseEvidence } from "../lib/evidence/match-store.ts";
import { captureCaseNotice } from "../lib/evidence/notice-store.ts";
import { createPacketArchive } from "../lib/evidence/packet-archive.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { writeReviewDecision } from "../lib/evidence/review-state.ts";
import { loadReplayPayment } from "../lib/paypal/replay.ts";
import { persistPayment } from "../lib/paypal/store.ts";

const fixture = new URL("../fixtures/restriction-agency-v1/", import.meta.url);
const jsonFile = async (url) => JSON.parse(await readFile(url, "utf8"));
const findingKey = ({ request, deliverable }) => deliverable ? `${request}:${deliverable}` : request;

function checkKeyCitations(actual, expected) {
  for (const citation of expected) {
    assert.ok(actual.some((ref) => ref.source_id === citation.source &&
      ("pointer" in citation ? ref.pointer === citation.pointer :
        ref.start_line >= citation.start_line && ref.end_line <= citation.end_line)),
    `No citation within the answer key's source and location: ${JSON.stringify(citation)}`);
  }
}

function checkExportedExcerpt(sources, citation) {
  const source = sources.get(citation.sourceId);
  assert.ok(source, `Missing source ${citation.sourceId}`);
  assert.equal(citation.name, source.source_name);
  if (citation.lines !== null) {
    assert.ok(citation.lines.length > 0);
    const lines = source.source_content.split(/\r\n|\r|\n/);
    for (const { number, text } of citation.lines) {
      assert.ok(Number.isInteger(number) && number > 0 && number <= lines.length);
      assert.equal(text, lines[number - 1]);
    }
    return;
  }
  assert.ok(citation.location.startsWith("/"));
  let value = JSON.parse(source.source_content);
  for (const token of citation.location.slice(1).split("/")) {
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(value && Object.hasOwn(value, key), `Unresolved pointer ${citation.location}`);
    value = value[key];
  }
  assert.deepEqual(JSON.parse(citation.value), value);
}

async function exportReview(review, decisions) {
  const archive = unzipSync(await createPacketArchive(buildEvidencePacket(review, JSON.parse(decisions))));
  assert.deepEqual(Object.keys(archive).sort(), ["reviewed-evidence.json", "reviewed-evidence.pdf"]);
  assert.equal(strFromU8(archive["reviewed-evidence.pdf"].subarray(0, 5)), "%PDF-");
  return JSON.parse(strFromU8(archive["reviewed-evidence.json"]));
}

test("imported agency case reconstructs, reviews and exports against its separate answer key", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const migration of ["001_case_evidence.sql", "002_restriction_notice.sql"]) {
    await db.exec(await readFile(new URL(`../db/migrations/${migration}`, import.meta.url), "utf8"));
  }
  const manifest = await jsonFile(new URL("inputs/manifest.json", fixture));
  const merchantKey = "reconstruction-integration";
  const { rows: [{ case_id: caseId }] } = await db.query(
    "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ($1, $2) RETURNING case_id",
    [merchantKey, manifest.case_id],
  );
  const documents = await loadFixtureDocuments();
  const notice = documents.find(({ source_kind }) => source_kind === "merchant_provided_simulated_notice");
  assert.ok(notice);
  await persistDocuments(db, caseId, merchantKey, documents);
  const payment = await persistPayment(db, caseId, merchantKey, loadReplayPayment());
  await captureCaseNotice(db, caseId, merchantKey, notice.source_id);
  const report = await matchCaseEvidence(db, caseId, merchantKey, notice.source_id, payment.source_id);

  const readSources = async () => (await db.query(
    `SELECT source_id, source_kind, source_origin, source_name, source_content
     FROM evidence_sources WHERE case_id = $1 ORDER BY source_id`,
    [caseId],
  )).rows;
  const stored = await readSources();
  assert.deepEqual(stored.map(({ source_id }) => source_id), manifest.sources.map(({ id }) => id).sort());
  const sources = new Map(stored.map((source) => [source.source_id, source]));
  const review = buildReviewSnapshot({
    sources: stored,
    report,
    payment: JSON.parse(sources.get(payment.source_id).source_content),
  });

  // Exercise all three review states, then verify an all-accepted export as well.
  const allocation = review.proposals.find(({ request }) => request === "R1");
  const d1 = review.proposals.find(({ id }) => id.endsWith(":D1"));
  const d2 = review.proposals.find(({ id }) => id.endsWith(":D2"));
  assert.ok(allocation && d1 && d2, "The reviewer should see the payment and both receipts");
  let decisions = writeReviewDecision(null, review, allocation.id, "accepted");
  decisions = writeReviewDecision(decisions, review, d1.id, "rejected");
  const partial = await exportReview(review, decisions);
  decisions = writeReviewDecision(decisions, review, d1.id, "accepted");
  decisions = writeReviewDecision(decisions, review, d2.id, "accepted");
  const full = await exportReview(review, decisions);

  // Load labels only after generating the packets. Neither the import nor export uses them.
  const key = await jsonFile(new URL("evaluation/expected.json", fixture));
  assert.equal(key.case_id, manifest.case_id);
  assert.equal(key.fixture_version, manifest.fixture_version);
  const expected = key.expected_findings;
  const supported = expected.filter(({ status }) => status === "supported");
  const diagnostics = expected.filter(({ status }) => status === "review_required" || status === "missing_evidence");
  const excluded = expected.filter(({ status }) => status === "excluded");
  const matches = new Map(report.matches.map((match) => [findingKey({ ...match, request: match.request_label }), match]));
  assert.deepEqual([...matches.keys()].sort(), supported.map(findingKey).sort());
  for (const finding of supported) {
    checkKeyCitations(matches.get(findingKey(finding)).citations, finding.citations);
  }
  const flags = new Map(report.diagnostics.map((item) => [findingKey({ ...item, request: item.request_label }), item]));
  assert.deepEqual([...flags.keys()].sort(), diagnostics.map(findingKey).sort());
  for (const finding of diagnostics) {
    const flag = flags.get(findingKey(finding));
    assert.equal(flag.status, finding.status);
    checkKeyCitations(flag.citations, finding.citations);
    if (finding.payer) {
      assert.equal(flag.payer, finding.payer);
      assert.equal(flag.invoice_buyer, finding.invoice_buyer);
      assert.equal(flag.client_explanation?.reported_by, finding.invoice_buyer);
    }
  }
  assert.deepEqual(report.exclusions.map(({ source_id }) => source_id), excluded.map(({ excluded_source }) => excluded_source));
  for (const finding of excluded) {
    checkKeyCitations(report.exclusions.find(({ source_id }) => source_id === finding.excluded_source).citations, finding.citations);
  }

  const expectedPayment = supported.find(({ transaction_id }) => transaction_id);
  const matchedPayment = matches.get(findingKey(expectedPayment));
  assert.equal(matchedPayment.transaction_id, expectedPayment.transaction_id);
  assert.deepEqual(matchedPayment.amount, { currency: expectedPayment.currency, value: expectedPayment.total });
  assert.deepEqual(matchedPayment.invoices, expectedPayment.invoices.map(({ id }) => id));
  assert.deepEqual(partial.accepted_claims.map(({ id }) => id), [allocation.id]);
  assert.deepEqual(partial.omitted_proposals, [
    { request: d1.request, title: d1.title, status: "rejected" },
    { request: d2.request, title: d2.title, status: "pending" },
  ]);
  assert.equal(full.omitted_proposals.length, 0);
  assert.deepEqual(full.accepted_claims.map(({ request, id }) => findingKey({
    request, deliverable: id.split(":").at(-1)?.match(/^D[0-9]+$/)?.[0],
  })).sort(), supported.map(findingKey).sort());

  for (const packet of [partial, full]) {
    assert.equal(packet.mode, "synthetic_replay");
    assert.equal(packet.capture_id, expectedPayment.transaction_id);
    assert.equal(packet.review_version, review.version);
    assert.deepEqual(packet.gaps.map(({ request, status }) => [request, status]),
      diagnostics.map(({ request, status }) => [request, status]));
    for (const finding of diagnostics.filter(({ deliverable }) => deliverable)) {
      const gap = packet.gaps.find(({ request, status }) => request === finding.request && status === finding.status);
      assert.ok(gap.title.includes(finding.deliverable) && gap.next_evidence.includes(finding.deliverable));
    }
    const exported = JSON.stringify(packet);
    for (const { excluded_source: id } of excluded) {
      assert.ok(!exported.includes(id) && !exported.includes(sources.get(id).source_name));
    }
    for (const claim of packet.accepted_claims) {
      assert.ok(claim.citations.length > 0);
      for (const citation of claim.citations) checkExportedExcerpt(sources, citation);
      const finding = supported.find(({ request, deliverable }) =>
        claim.request === request && (!deliverable || claim.id.endsWith(`:${deliverable}`)));
      assert.ok(finding);
      checkKeyCitations(claim.citations.map(({ sourceId, lines, location }) => lines
        ? { source_id: sourceId, start_line: lines[0].number, end_line: lines.at(-1).number }
        : { source_id: sourceId, pointer: location }), finding.citations);
    }
    const exportedPayment = packet.accepted_claims.find(({ id }) => id === allocation.id);
    assert.ok(exportedPayment);
    for (const { id } of expectedPayment.invoices) assert.ok(exportedPayment.statement.includes(id));
    const amount = exportedPayment.citations.find(({ sourceId, location }) => sourceId === payment.source_id && location === "/amount");
    assert.deepEqual(JSON.parse(amount.value), { currency: expectedPayment.currency, value: expectedPayment.total });
  }
  const partialText = JSON.stringify(partial);
  for (const withheld of [d1, d2]) {
    assert.ok(!partialText.includes(withheld.statement));
  }
  assert.deepEqual(await readSources(), stored, "Review and export must not change stored evidence");
});
