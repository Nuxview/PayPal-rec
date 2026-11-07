import { isDeepStrictEqual } from "node:util";
import { type CasePayment, PaymentImportError } from "./payment.ts";

type TransactionClient = {
  query(sql: string, parameters?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export async function persistPayment(
  client: TransactionClient,
  caseId: string,
  merchantKey: string,
  payment: CasePayment,
) {
  const replay = payment.source_mode === "synthetic_replay";
  const sourceId = replay ? "SRC-02" : `PAYPAL-CAPTURE-${payment.transaction_id}`;
  const kind = replay ? "paypal_payment_fixture" : "paypal_payment_capture";
  const name = replay ? "paypal-payment.json" : `paypal-${payment.transaction_id}.json`;
  const content = JSON.stringify(payment, null, 2) + "\n";
  await client.query("BEGIN");
  try {
    const owned = await client.query(
      "SELECT case_id FROM reconstruction_cases WHERE case_id = $1 AND merchant_key = $2 FOR SHARE",
      [caseId, merchantKey],
    );
    if (!owned.rows.length) throw new PaymentImportError("Case not found for this merchant.");

    const saved = await client.query(
      `INSERT INTO evidence_sources
        (case_id, source_id, source_kind, source_origin, source_name, source_content)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (case_id, source_id) DO NOTHING
       RETURNING source_id`,
      [caseId, sourceId, kind, payment.source_mode, name, content],
    );
    const result = saved.rows.length ? "imported" : "already_imported";
    if (result === "already_imported") {
      const { rows: [existing] } = await client.query(
        "SELECT source_kind, source_origin, source_content FROM evidence_sources WHERE case_id = $1 AND source_id = $2",
        [caseId, sourceId],
      );
      let previous: unknown;
      try {
        if (typeof existing?.source_content === "string") previous = JSON.parse(existing.source_content);
      } catch {
        // An unreadable existing snapshot is a conflict, not safe to replace.
      }
      if (existing?.source_kind !== kind || existing.source_origin !== payment.source_mode ||
          !isDeepStrictEqual(previous, payment)) {
        throw new PaymentImportError("This payment source already has a different snapshot. The existing evidence was preserved.");
      }
    }
    await client.query("COMMIT");
    return { source_id: sourceId, result };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
