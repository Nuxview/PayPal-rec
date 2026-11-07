import { asRecord } from "../paypal/payment.ts";
import { parseRestrictionNotice } from "./notice.ts";
import {
  clientMail, handoffRecord, hits, invoiceRecord, money, normalized, sameMoney, scopeRecord,
  type MatchCitation, type MatchSource,
} from "./match-records.ts";

type Notice = ReturnType<typeof parseRestrictionNotice>;
type Payment = NonNullable<ReturnType<typeof paymentRecord>>;
type Scope = NonNullable<ReturnType<typeof scopeRecord>>;
type Invoice = NonNullable<ReturnType<typeof invoiceRecord>>;
type Mail = NonNullable<ReturnType<typeof clientMail>>;

export type ProposedMatch = {
  kind: "payment_allocation" | "delivery_receipt";
  request_label: string;
  statement: string;
  citations: MatchCitation[];
  transaction_id?: string;
  amount?: { value: string; currency: string };
  invoices?: string[];
  deliverable?: string;
};

type Exclusion = { source_id: string; reason: "different_project"; citations: MatchCitation[] };

function paymentRecord(source: MatchSource | undefined) {
  if (!source || !(
    (source.source_origin === "synthetic_replay" && source.source_kind === "paypal_payment_fixture") ||
    (source.source_origin === "paypal_sandbox" && source.source_kind === "paypal_payment_capture")
  )) return;
  try {
    const data = asRecord(JSON.parse(source.source_content));
    const raw = asRecord(data.amount);
    const amount = money(raw.currency, raw.value);
    if (!amount || amount.units <= BigInt(0) || data.capture_status !== "COMPLETED" ||
        typeof data.transaction_id !== "string" || !/^[A-Za-z0-9_-]{1,50}$/.test(data.transaction_id) ||
        data.source_mode !== source.source_origin) return;
    return { id: data.transaction_id, amount, sourceId: source.source_id, origin: source.source_origin };
  } catch {
    return;
  }
}

function anchoredPayment(notice: Notice, payment: Payment) {
  const field = notice.fields.payment_under_review;
  const anchor = /^([A-Za-z0-9_-]+),\s*([A-Z]{3})\s+([0-9,.]+)$/.exec(field?.text ?? "");
  const amount = anchor && money(anchor[2], anchor[3]);
  return field && anchor?.[1] === payment.id && amount && sameMoney(amount, payment.amount) ? field.citation : undefined;
}

function scopeMail(scope: Scope, mail: Mail) {
  return mail.from === scope.contact && mail.project === scope.project;
}

function allocationRecords(scope: Scope, payment: Payment, invoices: Invoice[], mail: Mail[]) {
  return mail.filter((message) => scopeMail(scope, message)).flatMap((message) => {
    const references = hits(message.lines, /^The PayPal transaction reference is ([A-Za-z0-9_-]+) for ([A-Z]{3}) ([0-9,.]+)\.$/i);
    const allocations = hits(message.lines, /^Please apply (?:that single payment|this payment|the payment) to invoices? (.+)\.$/i);
    if (references.length !== 1 || allocations.length !== 1) return [];
    const ref = references[0];
    const amount = money(ref.match[2], ref.match[3]);
    if (!amount || ref.match[1] !== payment.id || !sameMoney(amount, payment.amount)) return [];

    const allocation = allocations[0];
    const ids = allocation.match[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/i);
    if (ids.some((id) => !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) return [];
    const selected: Invoice[] = [];
    for (const id of ids) {
      const candidates = invoices.filter((invoice) => invoice.id === id);
      if (candidates.length !== 1) return [];
      const [invoice] = candidates;
      if (invoice.project !== scope.project || normalized(invoice.buyer) !== normalized(scope.client) ||
          invoice.amount.currency !== payment.amount.currency) return [];
      selected.push(invoice);
    }
    if (selected.reduce((sum, invoice) => sum + invoice.amount.units, BigInt(0)) !== payment.amount.units) return [];
    return [{ scope, invoices: selected, citations: [...message.citations, ref.citation, allocation.citation] }];
  });
}

function requestFor(notice: Notice, pattern: RegExp) {
  const candidates = notice.requests.filter((item) => pattern.test(item.text));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function uniqueCitations(citations: MatchCitation[]) {
  return [...new Map(citations.map((citation) => [JSON.stringify(citation), citation])).values()];
}

export function proposeEvidenceMatches(sources: MatchSource[], notice: Notice, paymentSourceId: string) {
  const matches: ProposedMatch[] = [];
  const exclusions: Exclusion[] = [];
  const report = () => ({
    notice_source_id: notice.source_id,
    payment_source_id: paymentSourceId,
    matches,
    exclusions,
    unmatched_requests: notice.requests.filter(({ label }) => !matches.some((match) => match.request_label === label))
      .map(({ label }) => label),
  });
  const payment = paymentRecord(sources.find((source) => source.source_id === paymentSourceId));
  if (!payment) return report();
  const origin = payment.origin === "synthetic_replay" ? "synthetic_replay" : "merchant_provided";
  if (sources.find((source) => source.source_id === notice.source_id)?.source_origin !== origin) return report();
  const anchor = anchoredPayment(notice, payment);
  if (!anchor) return report();

  const documents = sources.filter((source) => source.source_origin === origin)
    .sort((a, b) => a.source_id.localeCompare(b.source_id));
  const scopes = documents.map(scopeRecord).filter((item): item is Scope => item !== undefined);
  const invoices = documents.map(invoiceRecord).filter((item): item is Invoice => item !== undefined);
  const mail = documents.map(clientMail).filter((item): item is Mail => item !== undefined);
  const allocations = scopes.flatMap((scope) => allocationRecords(scope, payment, invoices, mail));
  if (allocations.length !== 1) return report();
  const [{ scope, invoices: allocated, citations: allocationCitations }] = allocations;
  const paymentRequest = requestFor(notice, /\b(?:invoices?|agreement)\b.*\bpayment\b|\bpayment\b.*\b(?:invoices?|agreement)\b/i);
  const paymentCitations = [
    anchor,
    { source_id: payment.sourceId, pointer: "/transaction_id" },
    { source_id: payment.sourceId, pointer: "/amount" },
    { source_id: payment.sourceId, pointer: "/capture_status" },
    scope.projectCitation, scope.clientCitation,
    ...allocated.flatMap((invoice) => invoice.citations),
    ...allocationCitations,
  ];
  if (paymentRequest) {
    const ids = allocated.map(({ id }) => id);
    matches.push({
      kind: "payment_allocation",
      request_label: paymentRequest.label,
      statement: `The client allocated PayPal capture ${payment.id} to ${ids.join(", ")}; the invoice totals reconcile.`,
      transaction_id: payment.id,
      amount: { currency: payment.amount.currency, value: payment.amount.value },
      invoices: ids,
      citations: uniqueCitations([paymentRequest.citation, ...paymentCitations]),
    });
  }

  for (const source of documents) {
    const handoff = handoffRecord(source);
    if (handoff && handoff.project !== scope.project &&
        scope.items.some(({ title }) => normalized(title) === normalized(handoff.title))) {
      exclusions.push({
        source_id: source.source_id,
        reason: "different_project",
        citations: [scope.projectCitation, ...handoff.citations],
      });
    }
  }

  const deliveryRequest = requestFor(notice, /\b(?:proof|evidence) of delivery\b/i);
  if (!deliveryRequest) return report();
  const excludedIds = new Set(exclusions.map(({ source_id }) => source_id));
  for (const item of scope.items) {
    const billed = allocated.flatMap((invoice) => invoice.items).filter(({ id }) => id === item.id);
    if (billed.length !== 1 || normalized(billed[0].title) !== normalized(item.title) ||
        !sameMoney(billed[0].amount, item.amount)) continue;
    for (const message of mail.filter((record) => scopeMail(scope, record))) {
      const receipt = hits(message.lines,
        /^We (?:received|confirm receipt of|confirmed receipt of) (?:the )?(.+?) \((D[1-9][0-9]*)\)(?: and (?:could open it|confirmed our team can access it))?\.(?: Thanks\.)?$/i)
        .find(({ match, citation }) => !excludedIds.has(citation.source_id) &&
          match[2] === item.id && normalized(match[1]) === normalized(item.title));
      if (!receipt) continue;
      matches.push({
        kind: "delivery_receipt",
        request_label: deliveryRequest.label,
        deliverable: item.id,
        statement: `The client contact acknowledged receipt of ${item.title} (${item.id}).`,
        citations: uniqueCitations([deliveryRequest.citation, scope.projectCitation, scope.clientCitation,
          item.citation, billed[0].citation, ...message.citations, receipt.citation]),
      });
      break;
    }
  }
  return report();
}
