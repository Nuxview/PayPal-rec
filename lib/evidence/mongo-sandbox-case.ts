import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Binary, BSON, MongoClient, type Collection } from "mongodb";
import { type CasePayment, PaymentImportError } from "../paypal/payment.ts";
import { loadSandboxPayment, type SandboxCredentials } from "../paypal/sandbox.ts";
import { paymentSnapshot } from "../paypal/store.ts";
import { exceedsSandboxUploadLimits, sandboxUploadLimitMessage } from "./document-limits.ts";
import { DocumentIngestError, merchantDocument, type EvidenceDocument } from "./documents.ts";
import { proposeEvidenceMatches } from "./match.ts";
import { type MatchSource } from "./match-records.ts";
import { EvidenceMatchError } from "./match-store.ts";
import { noticeParserVersion, parseRestrictionNotice } from "./notice.ts";
import type { ReviewSnapshot } from "./review-snapshot.ts";
import type { ReviewDecisions } from "./review-state.ts";
import { buildSandboxReview, caseUuid, sandboxImportDocuments, sandboxMerchant, type SandboxCaseInput } from "./sandbox-case.ts";

type CaseSource = MatchSource & { source_name: string };
export type SandboxDecision = "accepted" | "rejected" | "pending";
export type SandboxReviewEvent = {
  id: string;
  reviewer: string;
  at: Date;
  evidenceVersion: string;
  decision: SandboxDecision;
  claim: ReviewSnapshot["proposals"][number];
};
type PreviousEvidence = {
  evidenceVersion: string;
  reviewer: string;
  at: Date;
  noticeSourceId: string;
  paymentSourceId: string;
  parserVersion: number;
  sources: CaseSource[];
  changedRequests: string[];
};
type StoredCase = {
  _id: string;
  merchantKey: string;
  label: string;
  createdAt: Date;
  noticeSourceId: string;
  parserVersion: number;
  paymentSourceId: string;
  sources: CaseSource[];
  serial?: string;
  revision?: string;
  revisions?: PreviousEvidence[];
  reviewHistory?: SandboxReviewEvent[];
  archived?: { reviewer: string; at: Date };
};

let connection: { uri: string; ready: Promise<MongoClient> } | undefined;

type MongoSandboxConnection = { uri: string; name: string };
type StoredPacket = {
  _id: string;
  caseId: string;
  merchantKey: string;
  serial: string;
  version: string;
  exportedAt: Date;
  archive: Binary;
};

function mongoSandboxDatabase({ uri, name }: MongoSandboxConnection) {
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
  return connection.client.db(name);
}

export function mongoSandboxCases(connection: MongoSandboxConnection) {
  return mongoSandboxDatabase(connection).collection<StoredCase>("sandbox_cases");
}

export function mongoSandboxPackets(connection: MongoSandboxConnection) {
  return mongoSandboxDatabase(connection).collection<StoredPacket>("sandbox_case_packets");
}

export async function retainSandboxPacket(
  packets: Collection<StoredPacket>, caseId: string, serial: string, version: string, archive: Uint8Array,
) {
  const _id = `${caseId}/${serial}`;
  const stored = await packets.findOneAndUpdate({ _id }, { $setOnInsert: {
    caseId, merchantKey: sandboxMerchant, serial, version, exportedAt: new Date(), archive: new Binary(archive),
  } }, { upsert: true, returnDocument: "after" });
  if (!stored || stored.merchantKey !== sandboxMerchant || stored.version !== version) {
    throw new EvidenceMatchError("The historical packet could not be retained.");
  }
  return stored.archive.value();
}

function validatedDocuments(documents: EvidenceDocument[]) {
  if (exceedsSandboxUploadLimits(documents.map(({ source_content }) => Buffer.byteLength(source_content)))) {
    throw new DocumentIngestError(sandboxUploadLimitMessage);
  }
  const sources = new Map<string, CaseSource>();
  for (const document of documents) {
    if (document.source_origin !== "merchant_provided" || document.source_kind !== "merchant_document") {
      throw new DocumentIngestError("Only supplied text documents can be added.");
    }
    const snapshot = merchantDocument(document.source_name, Buffer.from(document.source_content));
    if (snapshot.source_id !== document.source_id || snapshot.source_content !== document.source_content) {
      throw new DocumentIngestError("The document does not match its source snapshot.");
    }
    if (!sources.has(snapshot.source_id)) sources.set(snapshot.source_id, snapshot);
  }
  return sources;
}

export async function importMongoSandboxCase(
  cases: Collection<StoredCase>,
  input: SandboxCaseInput,
  credentials: SandboxCredentials,
  fetcher: typeof fetch = fetch,
) {
  const sources = validatedDocuments(sandboxImportDocuments(input));
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

function reviewStoredCase(row: StoredCase) {
  const source = row.sources.find(({ source_id }) => source_id === row.noticeSourceId);
  if (!source || row.parserVersion !== noticeParserVersion ||
      merchantDocument(source.source_name, Buffer.from(source.source_content)).source_id !== row.noticeSourceId) {
    throw new EvidenceMatchError("Captured notice no longer matches the stored source snapshot.");
  }
  const notice = parseRestrictionNotice(source.source_id, source.source_content);
  const report = proposeEvidenceMatches(row.sources, notice, row.paymentSourceId);
  return buildSandboxReview(row._id, row.paymentSourceId, { sources: row.sources, report, notice }, row.revision);
}

export async function loadMongoSandboxState(cases: Collection<StoredCase>, caseId: string) {
  if (!caseUuid.test(caseId)) throw new EvidenceMatchError("Sandbox case not found.");
  const row = await cases.findOne({ _id: caseId, merchantKey: sandboxMerchant, archived: { $exists: false } });
  if (!row) throw new EvidenceMatchError("Sandbox case not found.");
  const current = reviewStoredCase(row);
  const history = row.reviewHistory ?? [];
  const currentEvents = new Map<string, SandboxReviewEvent>();
  const claimIds = new Set(current.review.proposals.map(({ id }) => id));
  for (const event of history) {
    if (event.evidenceVersion === current.review.version && claimIds.has(event.claim.id)) {
      currentEvents.set(event.claim.id, event);
    }
  }
  const decisions: ReviewDecisions = {};
  for (const [id, { decision }] of currentEvents) {
    if (decision !== "pending") decisions[id] = decision;
  }
  return { ...current, row, history, currentEvents, decisions };
}

export async function loadMongoSandboxReview(cases: Collection<StoredCase>, caseId: string) {
  const { review, payment, notice, sources, paymentSourceId } = await loadMongoSandboxState(cases, caseId);
  return { review, payment, notice, sources, paymentSourceId };
}

type CurrentCase = Awaited<ReturnType<typeof loadMongoSandboxState>>;

export class SandboxCaseConflict extends Error {}

function checkCurrent(current: CurrentCase, version: string, serial: string) {
  if (current.review.version !== version || (current.row.serial ?? "") !== serial) {
    throw new SandboxCaseConflict("The case changed. Reload it and try again.");
  }
}

async function changeCase(cases: Collection<StoredCase>, row: StoredCase, changes: Partial<StoredCase>) {
  const serial = randomUUID();
  // Keep the entire audit trail without approaching MongoDB's 16 MiB document ceiling.
  if (BSON.calculateObjectSize({ ...row, ...changes, serial }) > 12 * 1024 * 1024) {
    throw new EvidenceMatchError("This case has reached its history storage limit.");
  }
  const result = await cases.updateOne({
    _id: row._id, merchantKey: sandboxMerchant, archived: { $exists: false },
    serial: row.serial ?? { $exists: false },
  }, { $set: { ...changes, serial } });
  if (result.matchedCount !== 1) throw new SandboxCaseConflict("The case changed. Reload it and try again.");
}

export async function saveMongoSandboxDecision(
  cases: Collection<StoredCase>, caseId: string, version: string, serial: string,
  claimId: string, decision: SandboxDecision, reviewer: string,
) {
  const current = await loadMongoSandboxState(cases, caseId);
  checkCurrent(current, version, serial);
  const claim = current.review.proposals.find(({ id }) => id === claimId);
  if (!claim || !["accepted", "rejected", "pending"].includes(decision)) throw new EvidenceMatchError("Invalid decision.");
  if ((current.decisions[claimId] ?? "pending") === decision) return claim.request;
  const event = { id: randomUUID(), reviewer, at: new Date(), evidenceVersion: version, decision, claim };
  await changeCase(cases, current.row, { reviewHistory: [...current.history, event] });
  return claim.request;
}

export async function updateMongoSandboxEvidence(
  cases: Collection<StoredCase>, caseId: string, version: string, serial: string, reviewer: string,
  edit: { documents: EvidenceDocument[]; notice?: EvidenceDocument; withdraw: string[]; orderId?: string },
  credentials: SandboxCredentials,
  fetcher: typeof fetch = fetch,
) {
  const current = await loadMongoSandboxState(cases, caseId);
  checkCurrent(current, version, serial);
  const { row } = current;
  const existing = row.sources.filter((source) => source.source_origin === "merchant_provided" && source.source_kind === "merchant_document");
  const withdraw = new Set(edit.withdraw);
  if ([...withdraw].some((id) => id === row.noticeSourceId || !existing.some(({ source_id }) => source_id === id))) {
    throw new DocumentIngestError("Select supporting documents from this case.");
  }
  const uploads = validatedDocuments(edit.notice ? [edit.notice, ...edit.documents] : edit.documents);
  const retained = existing.filter(({ source_id }) =>
    !withdraw.has(source_id) && (!edit.notice || source_id !== row.noticeSourceId || edit.notice.source_id === source_id));
  const active = new Map(retained.map((source) => [source.source_id, source]));
  for (const [id, source] of uploads) if (!active.has(id)) active.set(id, source);
  if (exceedsSandboxUploadLimits([...active.values()].map(({ source_content }) => Buffer.byteLength(source_content)))) {
    throw new DocumentIngestError(sandboxUploadLimitMessage);
  }
  const originalPayment = row.sources.find(({ source_id }) => source_id === row.paymentSourceId)!;
  let paymentSource = originalPayment;
  if (edit.orderId) {
    const payment = await loadSandboxPayment(current.payment.transaction_id, { ...credentials, orderId: edit.orderId }, fetcher);
    if (!payment.payer) throw new PaymentImportError("The linked order did not provide a payer name.");
    const capture = (value: CasePayment) => ({ id: value.transaction_id, amount: value.amount, status: value.capture_status, at: value.captured_at });
    if (JSON.stringify(capture(payment)) !== JSON.stringify(capture(current.payment))) {
      throw new PaymentImportError("The provider capture differs from the original case payment.");
    }
    paymentSource = { ...originalPayment, source_content: JSON.stringify({ ...JSON.parse(originalPayment.source_content),
      payer: payment.payer, linked_order_id: edit.orderId }, null, 2) + "\n" };
  }
  const noticeSourceId = edit.notice?.source_id ?? row.noticeSourceId;
  const sources = [...active.values(), paymentSource];
  if (noticeSourceId === row.noticeSourceId && sources.length === row.sources.length &&
      sources.every((source) => row.sources.some((old) => isDeepStrictEqual(old, source)))) return false;

  const revision = randomUUID();
  const next = reviewStoredCase({ ...row, revision, noticeSourceId, sources });
  const requestState = (state: typeof next, label: string) => JSON.stringify({
    request: state.notice.requests.find((request) => request.label === label),
    proposals: state.review.proposals.filter((proposal) => proposal.request === label),
    gaps: state.review.followUp.filter((gap) => gap.request === label),
  });
  const labels = new Set([...current.notice.requests, ...next.notice.requests].map(({ label }) => label));
  const previous = {
    evidenceVersion: version, reviewer, at: new Date(), noticeSourceId: row.noticeSourceId, paymentSourceId: row.paymentSourceId,
    parserVersion: row.parserVersion, sources: row.sources,
    changedRequests: [...labels].filter((label) => requestState(current, label) !== requestState(next, label)),
  };
  await changeCase(cases, row, { revision, noticeSourceId, sources, revisions: [...(row.revisions ?? []), previous] });
  return true;
}

export async function archiveMongoSandboxCase(
  cases: Collection<StoredCase>, caseId: string, version: string, serial: string, reviewer: string,
) {
  const current = await loadMongoSandboxState(cases, caseId);
  checkCurrent(current, version, serial);
  await changeCase(cases, current.row, { archived: { reviewer, at: new Date() } });
}

export async function listMongoSandboxCases(cases: Collection<StoredCase>) {
  const recent = await cases.find({ merchantKey: sandboxMerchant, archived: { $exists: false } }, { projection: { _id: 1, label: 1 } })
    .sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
  return recent.map(({ _id, label }) => ({ id: _id, label }));
}
