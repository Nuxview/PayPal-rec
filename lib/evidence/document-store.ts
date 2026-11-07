import { type EvidenceDocument, DocumentIngestError } from "./documents.ts";

type TransactionClient = {
  query(sql: string, parameters?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export async function persistDocuments(
  client: TransactionClient,
  caseId: string,
  merchantKey: string,
  documents: EvidenceDocument[],
) {
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    const owned = await client.query(
      "SELECT case_id FROM reconstruction_cases WHERE case_id = $1 AND merchant_key = $2 FOR SHARE",
      [caseId, merchantKey],
    );
    if (!owned.rows.length) throw new DocumentIngestError("Case not found for this merchant.");

    const results: { source_id: string; result: "imported" | "already_imported" }[] = [];
    // Lock source IDs in a consistent order when concurrent batches overlap.
    for (const doc of [...documents].sort((a, b) => a.source_id.localeCompare(b.source_id))) {
      const inserted = await client.query(
        `INSERT INTO evidence_sources
          (case_id, source_id, source_kind, source_origin, source_name, source_content)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (case_id, source_id) DO NOTHING
         RETURNING source_id`,
        [caseId, doc.source_id, doc.source_kind, doc.source_origin, doc.source_name, doc.source_content],
      );
      const result = inserted.rows.length ? "imported" : "already_imported";
      if (result === "already_imported") {
        const { rows: [existing] } = await client.query(
          "SELECT source_kind, source_origin, source_content FROM evidence_sources WHERE case_id = $1 AND source_id = $2",
          [caseId, doc.source_id],
        );
        if (existing?.source_kind !== doc.source_kind ||
          existing.source_origin !== doc.source_origin || existing.source_content !== doc.source_content) {
          throw new DocumentIngestError("A source ID already has a different snapshot. No documents from this batch were saved.");
        }
      }
      results.push({ source_id: doc.source_id, result });
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
