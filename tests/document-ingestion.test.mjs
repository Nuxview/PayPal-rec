import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  decodeDocument, isSelectedUpload, loadFixtureDocuments, loadMerchantDocuments, maxDocumentBytes,
} from "../lib/evidence/documents.ts";
import { persistDocuments } from "../lib/evidence/document-store.ts";
import { loadReplayPayment } from "../lib/paypal/replay.ts";
import { persistPayment } from "../lib/paypal/store.ts";

test("empty multipart inputs are omitted while selected files reach validation", () => {
  assert.equal(isSelectedUpload(new File([], "")), false);
  assert.equal(isSelectedUpload(new File([], "undefined", { type: "application/octet-stream" })), false);
  assert.equal(isSelectedUpload(new File([], "empty.txt")), true);
  assert.equal(isSelectedUpload(new File(["bytes"], "undefined", { type: "application/octet-stream" })), true);
});

test("fixture uses the original document IDs, source kinds and exact text", async () => {
  const docs = await loadFixtureDocuments();
  assert.deepEqual(docs.map(({ source_id }) => source_id),
    ["SRC-01", "SRC-03", "SRC-04", "SRC-05", "SRC-06", "SRC-07", "SRC-08", "SRC-09", "SRC-10"]);
  assert.ok(docs.every((doc) => doc.source_origin === "synthetic_replay"));
  assert.equal(docs[0].source_kind, "merchant_provided_simulated_notice");
  assert.equal(docs[0].source_content, await readFile(
    new URL("../fixtures/restriction-agency-v1/inputs/notice.txt", import.meta.url), "utf8",
  ));
  assert.equal(docs[8].source_name, "handoff-20261030.txt");
});

test("renaming a merchant document does not change its ID, but changing its bytes does", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "paypal-rec-doc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const a = join(dir, "invoice.txt");
  const b = join(dir, "duplicate.txt");
  const text = "\uFEFFInvoice\r\nDelivery notes: café\r\n";
  await writeFile(a, text);
  await writeFile(b, text);
  const docs = await loadMerchantDocuments([a, b]);
  assert.equal(docs.length, 1);
  assert.match(docs[0].source_id, /^DOC-[a-f0-9]{64}$/);
  assert.equal(docs[0].source_origin, "merchant_provided");
  assert.equal(docs[0].source_content, text);
  assert.equal((await loadMerchantDocuments([b]))[0].source_id, docs[0].source_id);

  await writeFile(b, text + "Added a line.\r\n");
  assert.notEqual((await loadMerchantDocuments([b]))[0].source_id, docs[0].source_id);
  await assert.rejects(loadMerchantDocuments([a, join(dir, "bad.pdf")]), /Only \.txt/);
});

test("rejects unsupported content before it can reach storage", () => {
  assert.throws(() => decodeDocument(Buffer.from([0xc3, 0x28])), /valid UTF-8/);
  assert.throws(() => decodeDocument(Buffer.from("A\0B")), /plain text/);
  assert.throws(() => decodeDocument(Buffer.from("  \r\n")), /plain text/);
  assert.throws(() => decodeDocument(Buffer.from("%PDF-1.7\nplaintext body")), /plain text/);
  assert.throws(() => decodeDocument(Buffer.alloc(maxDocumentBytes + 1, 0x61)), /size limit/);
});

test("PostgreSQL stores each fixture document once per case and rolls back a conflicting batch", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(new URL("../db/migrations/001_case_evidence.sql", import.meta.url), "utf8"));
  async function createCase(owner) {
    const { rows: [{ case_id }] } = await db.query(
      "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ($1, 'Demo') RETURNING case_id", [owner],
    );
    return case_id;
  }
  async function snapshots(caseId) {
    return (await db.query(
      "SELECT source_id, source_origin, source_content FROM evidence_sources WHERE case_id = $1 ORDER BY source_id",
      [caseId],
    )).rows;
  }

  const docs = await loadFixtureDocuments();
  const caseId = await createCase("demo-owner");
  const conflictCase = await createCase("other-owner");
  await assert.rejects(persistDocuments(db, caseId, "other-owner", docs), /Case not found/);
  assert.deepEqual(await snapshots(caseId), []);

  await persistPayment(db, caseId, "demo-owner", loadReplayPayment());
  const first = await persistDocuments(db, caseId, "demo-owner", docs);
  assert.equal(first.length, 9);
  assert.ok(first.every(({ result }) => result === "imported"));
  const rerun = await persistDocuments(db, caseId, "demo-owner", docs);
  assert.ok(rerun.every(({ result }) => result === "already_imported"));
  const saved = await snapshots(caseId);
  assert.equal(saved.length, 10); // Nine docs plus the independently imported payment.
  assert.equal(saved[0].source_content, docs[0].source_content);
  assert.equal(saved[1].source_id, "SRC-02");
  assert.equal(JSON.parse(saved[1].source_content).transaction_id, "DEMO-PP-CAPTURE-001");

  const conflicting = { ...docs.at(-1), source_content: "Original document in this case." };
  await persistDocuments(db, conflictCase, "other-owner", [conflicting]);
  const before = await snapshots(conflictCase);
  await assert.rejects(persistDocuments(db, conflictCase, "other-owner", docs), /different snapshot/);
  assert.deepEqual(await snapshots(conflictCase), before);
  assert.deepEqual(await snapshots(caseId), saved);
});
