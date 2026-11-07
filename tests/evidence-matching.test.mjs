import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { persistDocuments } from "../lib/evidence/document-store.ts";
import { loadFixtureDocuments } from "../lib/evidence/documents.ts";
import { proposeEvidenceMatches } from "../lib/evidence/match.ts";
import { matchCaseEvidence } from "../lib/evidence/match-store.ts";
import { captureCaseNotice } from "../lib/evidence/notice-store.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";
import { loadReplayPayment } from "../lib/paypal/replay.ts";
import { persistPayment } from "../lib/paypal/store.ts";

async function fixture() {
  return [...await loadFixtureDocuments(), {
    source_id: "SRC-02",
    source_kind: "paypal_payment_fixture",
    source_origin: "synthetic_replay",
    source_content: JSON.stringify(loadReplayPayment()),
  }];
}

function match(sources) {
  const notice = sources.find(({ source_id }) => source_id === "SRC-01");
  return proposeEvidenceMatches(sources, parseRestrictionNotice(notice.source_id, notice.source_content), "SRC-02");
}

function change(sources, id, oldText, newText) {
  return sources.map((source) => source.source_id === id
    ? { ...source, source_content: source.source_content.replace(oldText, newText) }
    : source);
}

test("fixture proposes only cited allocation and receipts and explicitly excludes the decoy", async () => {
  const sources = await fixture();
  const report = match(sources);
  const key = JSON.parse(await readFile(new URL(
    "../fixtures/restriction-agency-v1/evaluation/expected.json", import.meta.url,
  ), "utf8"));
  const expected = key.expected_findings.filter(({ status }) => status === "supported");
  assert.deepEqual(report.matches.map(({ request_label, deliverable }) => [request_label, deliverable]),
    expected.map(({ request, deliverable }) => [request, deliverable]));
  const [allocation] = report.matches;
  assert.equal(allocation.transaction_id, "DEMO-PP-CAPTURE-001");
  assert.deepEqual(allocation.amount, { currency: "USD", value: "2400.00" });
  assert.deepEqual(allocation.invoices, expected[0].invoices.map(({ id }) => id));
  assert.deepEqual(report.unmatched_requests, ["R2"]);
  assert.deepEqual(report.exclusions.map(({ source_id, reason }) => [source_id, reason]), [
    [key.expected_findings.find(({ status }) => status === "excluded").excluded_source, "different_project"],
  ]);
  for (const proposal of report.matches) {
    assert.ok(proposal.citations.some(({ source_id }) => source_id === "SRC-01"));
    assert.ok(proposal.citations.some(({ source_id }) => source_id !== "SRC-01"));
    assert.ok(proposal.citations.every(({ source_id }) => source_id !== "SRC-10"));
  }
  for (const item of [...report.matches, ...report.exclusions]) {
    for (const citation of item.citations) {
      const source = sources.find(({ source_id }) => source_id === citation.source_id);
      assert.ok(source);
      if ("pointer" in citation) {
        const value = citation.pointer.slice(1).split("/").reduce((record, part) => record[part], JSON.parse(source.source_content));
        assert.notEqual(value, undefined);
      } else {
        const lines = source.source_content.split(/\r\n|\r|\n/);
        assert.ok(citation.start_line >= 1 && citation.end_line >= citation.start_line && citation.end_line <= lines.length);
        assert.ok(lines[citation.start_line - 1].trim());
      }
    }
  }
});

test("equal amounts alone do not match; mismatched currencies and capture IDs fail closed", async () => {
  const sources = await fixture();
  assert.deepEqual(match(sources.filter(({ source_id }) => source_id !== "SRC-09")).matches, []);
  assert.deepEqual(match(change(sources, "SRC-05", "Total due: USD", "Total due: EUR")).matches, []);
  assert.deepEqual(match(change(sources, "SRC-05", "Total due: USD 800.00", "Total due: USD 799.99")).matches, []);
  assert.deepEqual(match(change(sources, "SRC-09", "DEMO-PP-CAPTURE-001", "DEMO-PP-CAPTURE-009")).matches, []);
});

test("receipts require the exact project, client contact and positive acknowledgement", async () => {
  const sources = await fixture();
  const wrongProject = change(sources, "SRC-06", "Subject: NL-17 /", "Subject: NL-170 /");
  const wrongContact = change(wrongProject, "SRC-07", "studio@northline-botanics.example", "studio@northline-florals.example");
  assert.deepEqual(match(wrongContact).matches.map(({ kind }) => kind), ["payment_allocation"]);
  const negative = change(sources, "SRC-07", "and confirmed our team can access it.", "but it was the wrong file.");
  assert.deepEqual(match(negative).matches.filter(({ deliverable }) => deliverable).map(({ deliverable }) => deliverable), ["D1"]);
  const forwarded = change(sources, "SRC-07", "We received", "Begin forwarded message:\nWe received");
  assert.deepEqual(match(forwarded).matches.filter(({ deliverable }) => deliverable).map(({ deliverable }) => deliverable), ["D1"]);
});

test("matcher uses source content rather than fixed request labels, parties or project IDs", async () => {
  const sources = (await fixture()).map((source) => ({
    ...source,
    source_content: source.source_content.replaceAll("NL-17", "PL-52").replaceAll("Northline Botanics", "Prairie Studio")
      .replaceAll("studio@northline-botanics.example", "hello@prairie.example").replace("R1:", "R8:").replace("R3:", "R9:"),
  }));
  assert.deepEqual(match(sources).matches.map(({ request_label }) => request_label), ["R8", "R9", "R9"]);
});

test("stored mode matches only the selected merchant case and checks captured request text", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ["001_case_evidence.sql", "002_restriction_notice.sql"]) {
    await db.exec(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"));
  }
  const { rows: [{ case_id: caseId }] } = await db.query(
    "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ('owner', 'Demo') RETURNING case_id",
  );
  await persistDocuments(db, caseId, "owner", await loadFixtureDocuments());
  await persistPayment(db, caseId, "owner", loadReplayPayment());
  await captureCaseNotice(db, caseId, "owner", "SRC-01");
  await assert.rejects(matchCaseEvidence(db, caseId, "other", "SRC-01", "SRC-02"), /not found/);
  const report = await matchCaseEvidence(db, caseId, "owner", "SRC-01", "SRC-02");
  assert.deepEqual(report, match(await fixture()));
  await db.query("UPDATE restriction_notice_requests SET request_text = 'Changed' WHERE case_id = $1 AND request_label = 'R1'", [caseId]);
  await assert.rejects(matchCaseEvidence(db, caseId, "owner", "SRC-01", "SRC-02"), /no longer resolve/);
});
