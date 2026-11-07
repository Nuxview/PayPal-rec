import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { proposeEvidenceMatches } from "./match.ts";
import { type MatchSource } from "./match-records.ts";
import { noticeParserVersion, parseRestrictionNotice } from "./notice.ts";

type QueryClient = {
  query(sql: string, parameters?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export class EvidenceMatchError extends Error {}

function isMatchSource(row: Record<string, unknown>): row is MatchSource {
  return typeof row.source_id === "string" && typeof row.source_kind === "string" &&
    typeof row.source_origin === "string" && typeof row.source_content === "string";
}

export async function matchCaseEvidence(
  client: QueryClient, caseId: string, merchantKey: string, noticeSourceId: string, paymentSourceId: string,
) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const { rows: [captured] } = await client.query(
      `SELECT n.source_sha256, n.parser_version
       FROM restriction_notices n
       JOIN reconstruction_cases c ON c.case_id = n.case_id
       WHERE c.case_id = $1 AND c.merchant_key = $2 AND n.source_id = $3`,
      [caseId, merchantKey, noticeSourceId],
    );
    if (!captured) throw new EvidenceMatchError("Captured notice not found for this merchant and case.");

    const { rows } = await client.query(
      "SELECT source_id, source_kind, source_origin, source_content FROM evidence_sources WHERE case_id = $1",
      [caseId],
    );
    const sources = rows.filter(isMatchSource);
    const source = sources.find(({ source_id }) => source_id === noticeSourceId);
    if (!source || captured.parser_version !== noticeParserVersion ||
        createHash("sha256").update(source.source_content, "utf8").digest("hex") !== captured.source_sha256) {
      throw new EvidenceMatchError("Captured notice no longer matches the stored source snapshot.");
    }
    if (!sources.some(({ source_id }) => source_id === paymentSourceId)) {
      throw new EvidenceMatchError("Payment source not found in this case.");
    }
    const notice = parseRestrictionNotice(noticeSourceId, source.source_content);
    const { rows: saved } = await client.query(
      `SELECT request_label, request_text, start_line, end_line
       FROM restriction_notice_requests
       WHERE case_id = $1 AND notice_source_id = $2 ORDER BY start_line`,
      [caseId, noticeSourceId],
    );
    const expected = notice.requests.map(({ label, text, citation }) => ({
      request_label: label, request_text: text, start_line: citation.start_line, end_line: citation.end_line,
    }));
    if (!isDeepStrictEqual(saved, expected)) {
      throw new EvidenceMatchError("Captured requests no longer resolve to the stored notice.");
    }
    const result = proposeEvidenceMatches(sources, notice, paymentSourceId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
