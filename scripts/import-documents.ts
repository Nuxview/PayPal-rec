import { parseArgs } from "node:util";
import pg from "pg";
import { DocumentIngestError, loadFixtureDocuments, loadMerchantDocuments } from "../lib/evidence/documents.ts";
import { persistDocuments } from "../lib/evidence/document-store.ts";

const usage = "Usage: npm run documents:import -- (--fixture | --file FILE [--file FILE ...]) [--case CASE_UUID --merchant MERCHANT_KEY]";

async function main() {
  let flags;
  try {
    flags = parseArgs({
      options: {
        fixture: { type: "boolean" },
        file: { type: "string", multiple: true },
        case: { type: "string" },
        merchant: { type: "string" },
      },
    }).values;
  } catch {
    throw new DocumentIngestError(usage);
  }
  if (Boolean(flags.fixture) === Boolean(flags.file)) throw new DocumentIngestError(usage);

  const caseId = flags.case;
  const merchantKey = flags.merchant;
  const connectionString = process.env.DATABASE_URL;
  if (caseId !== undefined || merchantKey !== undefined) {
    if (!caseId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId) || !merchantKey?.trim()) {
      throw new DocumentIngestError("Persistence requires both a case UUID and its merchant key.");
    }
    if (!connectionString?.trim()) throw new DocumentIngestError("Set DATABASE_URL to persist documents.");
  }

  const documents = flags.fixture ? await loadFixtureDocuments() : await loadMerchantDocuments(flags.file ?? []);
  const saved = new Map<string, "imported" | "already_imported">();
  if (caseId && merchantKey) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
    try {
      await client.connect();
      for (const { source_id, result } of await persistDocuments(client, caseId, merchantKey, documents)) {
        saved.set(source_id, result);
      }
    } finally {
      await client.end().catch(() => {});
    }
  }
  console.log(JSON.stringify({
    documents: documents.map(({ source_id, source_kind, source_origin, source_name }) => ({
      source_id, source_kind, source_origin, source_name,
      result: saved.get(source_id) ?? "preview",
    })),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof DocumentIngestError
    ? error.message
    : "Document import could not complete. Check your local configuration and database connection.");
  process.exitCode = 1;
});
