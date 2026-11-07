import { parseArgs } from "node:util";
import pg from "pg";
import { DocumentIngestError, loadFixtureDocuments } from "../lib/evidence/documents.ts";
import { captureCaseNotice } from "../lib/evidence/notice-store.ts";
import { NoticeCaptureError, parseRestrictionNotice } from "../lib/evidence/notice.ts";

const usage = "Usage: npm run notice:capture -- (--fixture | --case CASE_UUID --merchant MERCHANT_KEY --source SOURCE_ID)";

async function main() {
  let flags;
  try {
    flags = parseArgs({
      options: {
        fixture: { type: "boolean" },
        case: { type: "string" },
        merchant: { type: "string" },
        source: { type: "string" },
      },
    }).values;
  } catch {
    throw new NoticeCaptureError(usage);
  }
  const { fixture, case: caseId, merchant: merchantKey, source: sourceId } = flags;

  if (fixture) {
    if (caseId !== undefined || merchantKey !== undefined || sourceId !== undefined) {
      throw new NoticeCaptureError(usage);
    }
    const notice = (await loadFixtureDocuments()).find(
      ({ source_kind }) => source_kind === "merchant_provided_simulated_notice",
    );
    if (!notice) throw new NoticeCaptureError("No simulated notice was found in the fixture.");
    console.log(JSON.stringify({
      ...parseRestrictionNotice(notice.source_id, notice.source_content),
      source_origin: notice.source_origin,
      result: "preview",
    }, null, 2));
    return;
  }
  if (!caseId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId) ||
      !merchantKey?.trim() || !sourceId?.trim()) {
    throw new NoticeCaptureError(usage);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new NoticeCaptureError("Set DATABASE_URL to capture a case notice.");

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await captureCaseNotice(client, caseId, merchantKey, sourceId), null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof NoticeCaptureError || error instanceof DocumentIngestError
    ? error.message
    : "Notice capture could not complete. Check your local configuration and database connection.");
  process.exitCode = 1;
});
