import { randomUUID } from "node:crypto";
import { MongoClient, type Collection } from "mongodb";
import { loadSandboxPayment, type SandboxCredentials } from "../paypal/sandbox.ts";
import { paymentSnapshot } from "../paypal/store.ts";
import { exceedsSandboxUploadLimits, sandboxUploadLimitMessage } from "./document-limits.ts";
import { DocumentIngestError, merchantDocument } from "./documents.ts";
import { proposeEvidenceMatches } from "./match.ts";
import { type MatchSource } from "./match-records.ts";
import { EvidenceMatchError } from "./match-store.ts";
import { noticeParserVersion, parseRestrictionNotice } from "./notice.ts";
import { buildSandboxReview, caseUuid, sandboxImportDocuments, sandboxMerchant, type SandboxCaseInput } from "./sandbox-case.ts";

type CaseSource = MatchSource & { source_name: string };
type StoredCase = {
  _id: string;
  merchantKey: string;
  label: string;
  createdAt: Date;
  noticeSourceId: string;
  parserVersion: number;
  paymentSourceId: string;
  sources: CaseSource[];
};

let connection: { uri: string; ready: Promise<MongoClient> } | undefined;

export async function mongoSandboxCases({ uri, name }: { uri: string; name: string }) {
  if (connection?.uri !== uri) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8_000,
      waitQueueTimeoutMS: 8_000,
      socketTimeoutMS: 10_000,
    });
    const ready = client.connect().catch(async (error: unknown) => {
      // The driver can leave a closed topology after a failed first connection.
      // Discard that client so the next request starts a fresh connection.
      if (connection?.ready === ready) connection = undefined;
      await client.close().catch(() => {});
      throw error;
    });
    connection = { uri, ready };
  }
  const client = await connection.ready;
  return client.db(name).collection<StoredCase>("sandbox_cases");
}

export async function importMongoSandboxCase(
  cases: Collection<StoredCase>,
  input: SandboxCaseInput,
  credentials: SandboxCredentials,
  fetcher: typeof fetch = fetch,
) {
  const documents = sandboxImportDocuments(input);
  if (exceedsSandboxUploadLimits(documents.map(({ source_content }) => Buffer.byteLength(source_content)))) {
    throw new DocumentIngestError(sandboxUploadLimitMessage);
  }
  const sources = new Map<string, CaseSource>();
  for (const document of documents) {
    const snapshot = merchantDocument(document.source_name, Buffer.from(document.source_content));
    if (snapshot.source_id !== document.source_id || snapshot.source_content !== document.source_content) {
      throw new DocumentIngestError("The document does not match its source snapshot.");
    }
    if (!sources.has(snapshot.source_id)) sources.set(snapshot.source_id, snapshot);
  }
  const capture = await loadSandboxPayment(input.captureId, { ...credentials, orderId: input.orderId }, fetcher);
  const payment = paymentSnapshot(capture);
  const id = randomUUID();
  await cases.insertOne({
    _id: id,
    merchantKey: sandboxMerchant,
    label: `Sandbox ${capture.transaction_id}`,
    createdAt: new Date(),
    noticeSourceId: input.notice.source_id,
    parserVersion: noticeParserVersion,
    paymentSourceId: payment.source_id,
    sources: [...sources.values(), payment],
  });
  return id;
}

export async function loadMongoSandboxReview(cases: Collection<StoredCase>, caseId: string) {
  if (!caseUuid.test(caseId)) throw new EvidenceMatchError("Sandbox case not found.");
  const row = await cases.findOne({ _id: caseId, merchantKey: sandboxMerchant });
  if (!row) throw new EvidenceMatchError("Sandbox case not found.");
  const source = row.sources.find(({ source_id }) => source_id === row.noticeSourceId);
  if (!source || row.parserVersion !== noticeParserVersion ||
      merchantDocument(source.source_name, Buffer.from(source.source_content)).source_id !== row.noticeSourceId) {
    throw new EvidenceMatchError("Captured notice no longer matches the stored source snapshot.");
  }
  const notice = parseRestrictionNotice(source.source_id, source.source_content);
  const report = proposeEvidenceMatches(row.sources, notice, row.paymentSourceId);
  return buildSandboxReview(caseId, row.paymentSourceId, { sources: row.sources, report, notice });
}

export async function listMongoSandboxCases(cases: Collection<StoredCase>) {
  const recent = await cases.find({ merchantKey: sandboxMerchant }, { projection: { _id: 1, label: 1 } })
    .sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
  return recent.map(({ _id, label }) => ({ id: _id, label }));
}
