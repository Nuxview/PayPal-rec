import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { persistDocuments } from "../lib/evidence/document-store.ts";
import { loadFixtureDocuments } from "../lib/evidence/documents.ts";
import { captureCaseNotice } from "../lib/evidence/notice-store.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";

test("each fixture request resolves to an exact line in the simulated notice", async () => {
  const notice = (await loadFixtureDocuments()).find(({ source_id }) => source_id === "SRC-01");
  const parsed = parseRestrictionNotice(notice.source_id, notice.source_content);
  assert.equal(parsed.request_state, "extracted");
  assert.deepEqual(parsed.requests.map(({ label, citation }) => [label, citation.source_id, citation.start_line]), [
    ["R1", "SRC-01", 6], ["R2", "SRC-01", 7], ["R3", "SRC-01", 8],
  ]);
  const lines = notice.source_content.split("\n");
  for (const { label, text, citation } of parsed.requests) {
    assert.equal(citation.start_line, citation.end_line);
    assert.equal(lines[citation.start_line - 1], `${label}: ${text}`);
  }
  assert.equal(parsed.fields.payment_under_review.citation.start_line, 5);
  assert.equal(parsed.fields.payment_under_review.text, "DEMO-PP-CAPTURE-001, USD 2,400.00");
  assert.equal(parsed.fields.reason, null);
  assert.equal(parsed.fields.deadline, null);
});

test("request-like prose and unscoped bullets do not substitute for missing notice text", () => {
  const parsed = parseRestrictionNotice("DOC-x", "Account notice\nDated:\nPlease submit paperwork.\n- Invoices");
  assert.equal(parsed.request_state, "unknown");
  assert.deepEqual(parsed.requests, []);
  assert.ok(Object.values(parsed.fields).every((value) => value === null));
});

test("marked lists preserve CRLF line locations and leave ambiguous labels unresolved", () => {
  const parsed = parseRestrictionNotice("DOC-x", [
    "To: Company A", "To: Company B", "Requested documents:", "", "1. Invoice 031",
    "- Proof of delivery", "", "Unrelated instructions", "- Sign in",
    "R4:", "R5: One version", "R5: Another version",
  ].join("\r\n"));
  assert.equal(parsed.fields.recipient, null);
  assert.equal(parsed.request_state, "partial");
  assert.deepEqual(parsed.requests.map(({ label, text, citation }) => [label, text, citation.start_line]), [
    ["L5", "Invoice 031", 5], ["L6", "Proof of delivery", 6],
  ]);
  assert.deepEqual(parsed.unresolved_lines, [10, 11, 12]);
});

test("captured notice requests stay case scoped and are not duplicated on reimport", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ["001_case_evidence.sql", "002_restriction_notice.sql"]) {
    await db.exec(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  const { rows: [{ case_id: caseId }, { case_id: otherCase }] } = await db.query(
    "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ('owner', 'Demo'), ('other', 'Other') RETURNING case_id",
  );
  const docs = await loadFixtureDocuments();
  await persistDocuments(db, caseId, "owner", docs);
  await assert.rejects(captureCaseNotice(db, caseId, "other", "SRC-01"), /not found/);
  await assert.rejects(captureCaseNotice(db, otherCase, "other", "SRC-01"), /not found/);
  await assert.rejects(captureCaseNotice(db, caseId, "owner", "SRC-04"), /Select a merchant text document/);

  assert.equal((await captureCaseNotice(db, caseId, "owner", "SRC-01")).result, "captured");
  assert.equal((await captureCaseNotice(db, caseId, "owner", "SRC-01")).result, "already_captured");
  const { rows } = await db.query(
    `SELECT r.request_label, r.notice_source_id, r.start_line, r.end_line
     FROM restriction_notice_requests r
     JOIN evidence_sources s ON s.case_id = r.case_id AND s.source_id = r.notice_source_id
     WHERE r.case_id = $1 ORDER BY r.start_line`,
    [caseId],
  );
  assert.deepEqual(rows, [6, 7, 8].map((line, i) => ({
    request_label: `R${i + 1}`, notice_source_id: "SRC-01", start_line: line, end_line: line,
  })));
  await assert.rejects(db.query(
    `INSERT INTO restriction_notice_requests
       (case_id, notice_source_id, request_label, request_text, start_line, end_line)
     VALUES ($1, 'SRC-01', 'R1', 'Another case', 6, 6)`, [otherCase],
  ), { code: "23503" });

  await persistDocuments(db, otherCase, "other", [{
    source_id: "DOC-incomplete", source_kind: "merchant_document", source_origin: "merchant_provided",
    source_name: "incomplete.txt", source_content: "Account limitation\nDated:\n",
  }]);
  const incomplete = await captureCaseNotice(db, otherCase, "other", "DOC-incomplete");
  assert.equal(incomplete.request_state, "unknown");
  assert.deepEqual(incomplete.requests, []);
  const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM restriction_notice_requests");
  assert.equal(count, 3);
});
