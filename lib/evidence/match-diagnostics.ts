import { clientMail, hits, normalized, projectLogContext, type MatchCitation, type MatchSource } from "./match-records.ts";

type Request = { label: string; citation: MatchCitation };
type Mail = NonNullable<ReturnType<typeof clientMail>>;
type CitedText = { text: string; citation: MatchCitation };

type DiagnosticBase = {
  request_label: string;
  statement: string;
  next_evidence: string;
  citations: MatchCitation[];
};

export type EvidenceDiagnostic =
  | (DiagnosticBase & {
      kind: "payer_mismatch";
      status: "review_required";
      payer: string;
      invoice_buyer: string;
      client_explanation: (CitedText & { reported_by: string }) | null;
    })
  | (DiagnosticBase & {
      kind: "delivery_gap";
      status: "missing_evidence";
      deliverable: string;
      internal_notes: CitedText[];
    });

export function payerMismatch(
  request: Request,
  payment: { sourceId: string; payerName: string | null },
  buyer: string,
  buyerCitations: MatchCitation[],
  client: string,
  allocation: { message: Mail; citations: MatchCitation[] },
  anchor: MatchCitation,
): EvidenceDiagnostic | undefined {
  const payer = payment.payerName;
  if (!payer || normalized(payer) === normalized(buyer)) return;

  const explanations = hits(
    allocation.message.lines,
    /^Our finance partner, ([^,]+), made the payment on our behalf\.$/i,
  );
  const explanation = explanations.length === 1 && normalized(explanations[0].match[1]) === normalized(payer)
    ? { text: explanations[0].match[0], citation: explanations[0].citation, reported_by: client }
    : null;
  return {
    kind: "payer_mismatch",
    status: "review_required",
    request_label: request.label,
    payer,
    invoice_buyer: buyer,
    statement: `The capture names ${payer} as payer; the invoices name ${buyer} as buyer. The relationship needs review.`,
    client_explanation: explanation,
    next_evidence: "Confirm the payer–buyer relationship and who authorized the payment.",
    citations: [
      request.citation,
      anchor,
      { source_id: payment.sourceId, pointer: "/transaction_id" },
      { source_id: payment.sourceId, pointer: "/payer/name" },
      ...buyerCitations,
      ...(explanation ? [...allocation.citations, explanation.citation] : []),
    ],
  };
}

export function deliveryGap(
  request: Request,
  project: string,
  projectCitation: MatchCitation,
  item: { id: string; title: string; citation: MatchCitation },
  invoiceCitation: MatchCitation,
  documents: MatchSource[],
): EvidenceDiagnostic {
  const context = documents.flatMap((source) => projectLogContext(source, project, item.id));
  return {
    kind: "delivery_gap",
    status: "missing_evidence",
    request_label: request.label,
    deliverable: item.id,
    statement: `No matching client receipt was found in the supplied evidence for ${item.title} (${item.id}).`,
    next_evidence: `Find a client acknowledgement or access record for ${item.id} on project ${project}.`,
    internal_notes: context.flatMap(({ notes }) => notes),
    citations: [request.citation, projectCitation, item.citation, invoiceCitation,
      ...context.flatMap(({ projectLine, notes }) => [projectLine, ...notes.map(({ citation }) => citation)])],
  };
}
