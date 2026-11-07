import { asRecord, normalizeCapture, PaymentImportError } from "../paypal/payment.ts";
import { loadSandboxPayment } from "../paypal/sandbox.ts";
import { persistPaymentInTransaction } from "../paypal/store.ts";
import { persistDocumentsInTransaction } from "./document-store.ts";
import { type EvidenceDocument } from "./documents.ts";
import { EvidenceMatchError, readMatchedCase } from "./match-store.ts";
import { captureCaseNoticeInTransaction } from "./notice-store.ts";
import { buildReviewSnapshot } from "./review-snapshot.ts";
import { inTransaction, type QueryClient } from "./transaction.ts";

export const sandboxMerchant = "paypal-sandbox-workspace";
export const caseUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function importSandboxCase(
  client: QueryClient,
  input: { captureId: string; orderId?: string; notice: EvidenceDocument; documents: EvidenceDocument[] },
  credentials: { clientId: string; clientSecret: string },
  fetcher: typeof fetch = fetch,
) {
  const documents = [input.notice, ...input.documents];
  if (documents.some((doc) => doc.source_origin !== "merchant_provided" || doc.source_kind !== "merchant_document")) {
    throw new EvidenceMatchError("Only documents supplied for this Sandbox case can be imported.");
  }
  // Complete the read-only PayPal lookup before creating any database records.
  const payment = await loadSandboxPayment(input.captureId, { ...credentials, orderId: input.orderId }, fetcher);
  return inTransaction(client, "BEGIN", async () => {
    const { rows: [row] } = await client.query(
      "INSERT INTO reconstruction_cases (merchant_key, case_label) VALUES ($1, $2) RETURNING case_id",
      [sandboxMerchant, `Sandbox ${payment.transaction_id}`],
    );
    if (typeof row?.case_id !== "string") throw new EvidenceMatchError("The Sandbox case could not be created.");
    const id = row.case_id;
    await persistDocumentsInTransaction(client, id, sandboxMerchant, documents);
    await persistPaymentInTransaction(client, id, sandboxMerchant, payment);
    await captureCaseNoticeInTransaction(client, id, sandboxMerchant, input.notice.source_id);
    return id;
  });
}

export async function loadSandboxReview(client: QueryClient, caseId: string) {
  if (!caseUuid.test(caseId)) throw new EvidenceMatchError("Sandbox case not found.");
  const { rows } = await client.query(
    `SELECT n.source_id AS notice_id, s.source_id AS payment_id
     FROM reconstruction_cases c
     JOIN restriction_notices n ON n.case_id = c.case_id
     JOIN evidence_sources s ON s.case_id = c.case_id AND s.source_origin = 'paypal_sandbox'
       AND s.source_kind = 'paypal_payment_capture'
     WHERE c.case_id = $1 AND c.merchant_key = $2`,
    [caseId, sandboxMerchant],
  );
  const [row] = rows;
  if (rows.length !== 1 || typeof row.notice_id !== "string" || typeof row.payment_id !== "string") {
    throw new EvidenceMatchError("Sandbox case not found or its sources are ambiguous.");
  }
  const { sources, report, notice } = await readMatchedCase(client, caseId, sandboxMerchant, row.notice_id, row.payment_id);
  const source = sources.find(({ source_id }) => source_id === row.payment_id);
  const raw = asRecord(JSON.parse(source?.source_content ?? "{}"));
  if (raw.source_mode !== "paypal_sandbox" || typeof raw.transaction_id !== "string" ||
    row.payment_id !== `PAYPAL-CAPTURE-${raw.transaction_id}`) {
    throw new PaymentImportError("The stored Sandbox capture is invalid.");
  }
  const amount = asRecord(raw.amount);
  const payer = asRecord(raw.payer);
  const payment = {
    ...normalizeCapture({
      id: raw.transaction_id, amount: { value: amount.value, currency_code: amount.currency },
      status: raw.capture_status, create_time: raw.captured_at,
    }, raw.transaction_id),
    payer: typeof payer.name === "string" && payer.name.trim()
      ? { name: payer.name, email: typeof payer.email === "string" ? payer.email : null } : null,
  };
  return { review: buildReviewSnapshot({ sources, report, payment }, caseId), payment, notice };
}

export async function listSandboxCases(client: QueryClient) {
  const { rows } = await client.query(
    `SELECT case_id, case_label FROM reconstruction_cases
     WHERE merchant_key = $1 ORDER BY created_at DESC LIMIT 20`, [sandboxMerchant],
  );
  return rows.flatMap(({ case_id, case_label }) => typeof case_id === "string" && typeof case_label === "string"
    ? [{ id: case_id, label: case_label }] : []);
}
