import { createHash } from "node:crypto";
import { type loadAgencyFixture } from "./agency-fixture.ts";
import { type MatchCitation } from "./match-records.ts";

type Fixture = Awaited<ReturnType<typeof loadAgencyFixture>>;
type Source = Fixture["sources"][number];

export type ReviewCitation = {
  sourceId: string;
  name: string;
  location: string;
  lines: { number: number; text: string }[] | null;
  value: string | null;
};

function resolveCitation(sources: Map<string, Source>, citation: MatchCitation): ReviewCitation {
  const source = sources.get(citation.source_id);
  if (!source) throw new Error(`Review citation references an unknown source: ${citation.source_id}`);
  const origin = { sourceId: source.source_id, name: source.source_name };
  if ("pointer" in citation) {
    let value: unknown = JSON.parse(source.source_content);
    for (const part of citation.pointer === "" ? [] : citation.pointer.slice(1).split("/")) {
      const token = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (typeof value !== "object" || value === null || !Object.hasOwn(value, token)) {
        throw new Error(`Review citation does not resolve: ${source.source_id} ${citation.pointer}`);
      }
      value = (value as Record<string, unknown>)[token];
    }
    return { ...origin, location: citation.pointer || "Whole document", lines: null, value: JSON.stringify(value, null, 2) };
  }
  const lines = source.source_content.split(/\r\n|\r|\n/);
  const { start_line: start, end_line: end } = citation;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
    throw new Error(`Review citation is out of bounds: ${source.source_id} ${start}–${end}`);
  }
  return {
    ...origin,
    location: start === end ? `Line ${start}` : `Lines ${start}–${end}`,
    lines: lines.slice(start - 1, end).map((text, index) => ({ number: start + index, text })),
    value: null,
  };
}

export function buildReviewSnapshot({ sources, report, payment }: Fixture) {
  const byId = new Map(sources.map((source) => [source.source_id, source]));
  const excerpts = (citations: MatchCitation[]) => citations.map((citation) => resolveCitation(byId, citation));
  const proposals = report.matches.map((match) => ({
    id: `${match.request_label}:${match.kind}:${match.deliverable ?? match.transaction_id}`,
    request: match.request_label,
    title: match.kind === "payment_allocation" ? "Payment allocation" : `${match.deliverable} · Delivery receipt`,
    statement: match.statement,
    citations: excerpts(match.citations),
  }));
  const followUp = report.diagnostics.map((diagnostic) => ({
    id: `${diagnostic.request_label}:${diagnostic.kind}:${"deliverable" in diagnostic ? diagnostic.deliverable : ""}`,
    request: diagnostic.request_label,
    title: diagnostic.kind === "payer_mismatch" ? "Payer mismatch" : `${diagnostic.deliverable} · Missing delivery evidence`,
    status: diagnostic.status,
    statement: diagnostic.statement,
    nextEvidence: diagnostic.next_evidence,
    explanation: diagnostic.kind === "payer_mismatch" ? diagnostic.client_explanation?.text ?? null : null,
    citations: excerpts(diagnostic.citations),
  }));
  const excluded = report.exclusions.map((item) => ({
    sourceId: item.source_id,
    name: byId.get(item.source_id)?.source_name ?? item.source_id,
    citations: excerpts(item.citations),
  }));

  // Decisions apply only to this report and these exact source snapshots.
  const version = createHash("sha256")
    .update(JSON.stringify({ report, sources: [...sources].sort((a, b) => a.source_id.localeCompare(b.source_id)) }))
    .digest("hex");
  return {
    version, captureId: payment.transaction_id, amount: `${payment.amount.currency} ${payment.amount.value}`,
    proposals, followUp, excluded,
  };
}

export type ReviewSnapshot = ReturnType<typeof buildReviewSnapshot>;
