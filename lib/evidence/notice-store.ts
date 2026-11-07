import { createHash } from "node:crypto";
import { noticeParserVersion, NoticeCaptureError, parseRestrictionNotice } from "./notice.ts";

type TransactionClient = {
  query(sql: string, parameters?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export async function captureCaseNotice(
  client: TransactionClient,
  caseId: string,
  merchantKey: string,
  sourceId: string,
) {
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    const { rows: [source] } = await client.query(
      `SELECT s.source_content, s.source_origin, s.source_kind
       FROM reconstruction_cases c
       JOIN evidence_sources s ON s.case_id = c.case_id
       WHERE c.case_id = $1 AND c.merchant_key = $2 AND s.source_id = $3
       FOR SHARE OF c, s`,
      [caseId, merchantKey, sourceId],
    );
    if (!source || typeof source.source_content !== "string") {
      throw new NoticeCaptureError("Notice source not found for this merchant and case.");
    }
    const { source_content, source_origin, source_kind } = source;
    if (!(
      (source_origin === "synthetic_replay" && source_kind === "merchant_provided_simulated_notice") ||
      (source_origin === "merchant_provided" && source_kind === "merchant_document")
    )) {
      throw new NoticeCaptureError("Select a merchant text document or the simulated restriction notice.");
    }
    const parsed = parseRestrictionNotice(sourceId, source_content);
    const digest = createHash("sha256").update(source_content, "utf8").digest("hex");
    const { rows: inserted } = await client.query(
      `INSERT INTO restriction_notices (case_id, source_id, source_sha256, parser_version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (case_id, source_id) DO NOTHING RETURNING source_id`,
      [caseId, sourceId, digest, String(noticeParserVersion)],
    );
    if (!inserted.length) {
      const { rows: [existing] } = await client.query(
        "SELECT source_sha256, parser_version FROM restriction_notices WHERE case_id = $1 AND source_id = $2",
        [caseId, sourceId],
      );
      if (existing?.source_sha256 !== digest || existing.parser_version !== noticeParserVersion) {
        throw new NoticeCaptureError("The notice snapshot or parser version changed. The original capture was preserved.");
      }
    } else {
      for (const item of parsed.requests) {
        await client.query(
          `INSERT INTO restriction_notice_requests
             (case_id, notice_source_id, request_label, request_text, start_line, end_line)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [caseId, sourceId, item.label, item.text, String(item.citation.start_line), String(item.citation.end_line)],
        );
      }
    }
    await client.query("COMMIT");
    return { ...parsed, source_origin, result: inserted.length ? "captured" : "already_captured" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
