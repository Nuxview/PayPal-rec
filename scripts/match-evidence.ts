import { parseArgs } from "node:util";
import pg from "pg";
import { DocumentIngestError, loadFixtureDocuments } from "../lib/evidence/documents.ts";
import { proposeEvidenceMatches } from "../lib/evidence/match.ts";
import { EvidenceMatchError, matchCaseEvidence } from "../lib/evidence/match-store.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";
import { loadReplayPayment } from "../lib/paypal/replay.ts";

const usage = "Usage: npm run evidence:match -- (--fixture | --case CASE_UUID --merchant MERCHANT_KEY --notice SOURCE_ID --payment SOURCE_ID)";

async function main() {
  let flags;
  try {
    flags = parseArgs({
      options: {
        fixture: { type: "boolean" },
        case: { type: "string" },
        merchant: { type: "string" },
        notice: { type: "string" },
        payment: { type: "string" },
      },
    }).values;
  } catch {
    throw new EvidenceMatchError(usage);
  }
  const { fixture, case: caseId, merchant: merchantKey, notice: noticeId, payment: paymentId } = flags;
  if (fixture) {
    if ([caseId, merchantKey, noticeId, paymentId].some((value) => value !== undefined)) {
      throw new EvidenceMatchError(usage);
    }
    const sources = await loadFixtureDocuments();
    const notice = sources.find(({ source_kind }) => source_kind === "merchant_provided_simulated_notice");
    if (!notice) throw new EvidenceMatchError("No simulated notice was found in the fixture.");
    const result = proposeEvidenceMatches([...sources, {
      source_id: "SRC-02",
      source_kind: "paypal_payment_fixture",
      source_origin: "synthetic_replay",
      source_content: JSON.stringify(loadReplayPayment()),
    }], parseRestrictionNotice(notice.source_id, notice.source_content), "SRC-02");
    console.log(JSON.stringify({ mode: "synthetic_replay", ...result }, null, 2));
    return;
  }
  if (!caseId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId) ||
      !merchantKey?.trim() || !noticeId?.trim() || !paymentId?.trim()) {
    throw new EvidenceMatchError(usage);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new EvidenceMatchError("Set DATABASE_URL to match stored evidence.");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await matchCaseEvidence(client, caseId, merchantKey, noticeId, paymentId), null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EvidenceMatchError || error instanceof DocumentIngestError
    ? error.message
    : "Evidence matching could not complete. Check your local configuration and database connection.");
  process.exitCode = 1;
});
