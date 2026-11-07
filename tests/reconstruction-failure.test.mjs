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

test("reconstruction fails closed with missing, duplicate and cross-case evidence", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const name of ["001_case_evidence.sql", "002_restriction_notice.sql"]) {
    await db.exec(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"));
  }
  const docs = await loadFixtureDocuments();
  const replay = loadReplayPayment();
  const owner = "same-merchant";
  const noticeId = docs.find(({ source_kind }) => source_kind === "merchant_provided_simulated_notice").source_id;

  async function seedCase(label, documents = docs, withPayment = true) {
    const { rows: [{ case_id }] } = await db.query(
      "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ($1, $2) RETURNING case_id", [owner, label],
    );
    await persistDocuments(db, case_id, owner, documents);
    if (withPayment) await persistPayment(db, case_id, owner, replay);
    await captureCaseNotice(db, case_id, owner, noticeId);
    return case_id;
  }

  const match = (id) => matchCaseEvidence(db, id, owner, noticeId, "SRC-02");
  async function reviewCase(id) {
    const report = await match(id);
    const { rows: sources } = await db.query(
      `SELECT source_id, source_kind, source_origin, source_name, source_content
       FROM evidence_sources WHERE case_id = $1 ORDER BY source_id`, [id],
    );
    const payment = JSON.parse(sources.find(({ source_id }) => source_id === report.payment_source_id).source_content);
    return { report, sources, review: buildReviewSnapshot({ sources, report, payment }) };
  }

  await t.test("missing or incomplete PayPal data never falls back to another case or yields a proposal", async () => {
    const completeCase = await seedCase("positive control");
    assert.equal((await match(completeCase)).matches.length, 3);

    const incompleteCase = await seedCase("missing PayPal capture", docs, false);
    await assert.rejects(match(incompleteCase), /Payment source not found in this case/);

    // Seed a payment through the normal importer, then simulate a damaged stored snapshot.
    await persistPayment(db, incompleteCase, owner, replay);
    for (const field of ["transaction_id", "capture_status", "amount"]) {
      const incomplete = { ...replay };
      delete incomplete[field];
      await db.query(
        "UPDATE evidence_sources SET source_content = $1 WHERE case_id = $2 AND source_id = 'SRC-02'",
        [JSON.stringify(incomplete), incompleteCase],
      );
      const report = await match(incompleteCase);
      assert.deepEqual(report.matches, [], `Missing ${field} must not produce a supported claim`);
      assert.deepEqual(report.diagnostics, []);
    }
  });

  await t.test("repeat imports are idempotent and an ambiguous duplicate invoice cannot be approved", async () => {
    const id = await seedCase("duplicate imports");
    const before = await reviewCase(id);
    assert.equal(before.report.matches.length, 3);

    const payment = await persistPayment(db, id, owner, replay);
    assert.equal(payment.result, "already_imported");
    const documents = await persistDocuments(db, id, owner, docs);
    assert.equal(documents.length, docs.length);
    assert.ok(documents.every(({ result }) => result === "already_imported"));
    assert.deepEqual(await reviewCase(id), before, "Re-import must not add records, citations or approvals");

    const allocation = before.review.proposals.find(({ request }) => request === "R1");
    const approved = JSON.parse(writeReviewDecision(null, before.review, allocation.id, "accepted"));
    assert.equal(buildEvidencePacket(before.review, approved).accepted_claims.length, 1);

    // A second snapshot claims the same invoice number under a different source ID.
    const invoice = docs.find(({ source_id }) => source_id === "SRC-04");
    await persistDocuments(db, id, owner, [{
      ...invoice,
      source_id: "DUPLICATE-INVOICE",
      source_name: "invoice-copy.txt",
      source_content: invoice.source_content + "\nSecond snapshot.",
    }]);
    const ambiguous = await reviewCase(id);
    assert.deepEqual(ambiguous.report.matches, []);
    assert.throws(() => buildEvidencePacket(ambiguous.review, approved), { status: 409 });
    assert.throws(() => buildEvidencePacket(ambiguous.review, {
      ...approved, version: ambiguous.review.version,
    }), { status: 400 });
  });

  await t.test("a matching receipt with the same source ID in another case cannot close the gap", async () => {
    const foreignId = await seedCase("complete neighboring case");
    const localId = await seedCase("case missing D1 receipt", docs.map((doc) => doc.source_id === "SRC-06"
      ? { ...doc, source_content: doc.source_content.replace(
        "We received the brand guidelines PDF (D1) and could open it. Thanks.",
        "The brand guidelines PDF (D1) has not reached us yet.",
      ) }
      : doc));
    const foreign = await reviewCase(foreignId);
    const local = await reviewCase(localId);
    assert.ok(foreign.report.matches.some(({ deliverable }) => deliverable === "D1"));
    assert.ok(local.report.matches.some(({ deliverable }) => deliverable === "D2"));
    assert.ok(local.report.matches.every(({ deliverable }) => deliverable !== "D1"));
    assert.ok(local.report.diagnostics.some(({ kind, deliverable }) => kind === "delivery_gap" && deliverable === "D1"));

    const foreignReceipt = foreign.review.proposals.find(({ id }) => id.endsWith(":D1"));
    const foreignDecision = JSON.parse(writeReviewDecision(null, foreign.review, foreignReceipt.id, "accepted"));
    assert.throws(() => buildEvidencePacket(local.review, foreignDecision), { status: 409 });
    assert.throws(() => buildEvidencePacket(local.review, {
      ...foreignDecision, version: local.review.version,
    }), { status: 400 });

    const localReceipt = local.review.proposals.find(({ id }) => id.endsWith(":D2"));
    const localDecision = JSON.parse(writeReviewDecision(null, local.review, localReceipt.id, "accepted"));
    const archive = unzipSync(await createPacketArchive(buildEvidencePacket(local.review, localDecision)));
    const packetText = strFromU8(archive["reviewed-evidence.json"]);
    const packet = JSON.parse(packetText);
    assert.deepEqual(packet.accepted_claims.map(({ id }) => id), [localReceipt.id]);
    assert.ok(packet.gaps.some(({ title, status }) => title.startsWith("D1") && status === "missing_evidence"));
    assert.ok(!packetText.includes("SRC-06") && !packetText.includes("We received the brand guidelines"));
  });
});
