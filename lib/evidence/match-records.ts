export type MatchSource = {
  source_id: string;
  source_kind: string;
  source_origin: string;
  source_content: string;
};

export type MatchCitation =
  | { source_id: string; start_line: number; end_line: number }
  | { source_id: string; pointer: string };

type Line = { text: string; citation: MatchCitation };
type Hit = { match: RegExpExecArray; citation: MatchCitation };
type Money = { currency: string; value: string; units: bigint };

export function sourceLines(source: MatchSource): Line[] {
  return source.source_content.split(/\r\n|\r|\n/).map((text, i) => ({
    text: text.trim(),
    citation: { source_id: source.source_id, start_line: i + 1, end_line: i + 1 },
  }));
}

export function hits(lines: Line[], pattern: RegExp): Hit[] {
  return lines.flatMap(({ text, citation }) => {
    const match = pattern.exec(text);
    return match ? [{ match, citation }] : [];
  });
}

function one(lines: Line[], pattern: RegExp) {
  const found = hits(lines, pattern);
  return found.length === 1 ? found[0] : undefined;
}

export function money(currency: unknown, value: unknown): Money | undefined {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) || typeof value !== "string" ||
      !/^(?:[0-9]{1,24}|[0-9]{1,3}(?:,[0-9]{3}){1,7})(?:\.[0-9]{1,8})?$/.test(value)) return;
  const clean = value.replaceAll(",", "");
  const [whole, fraction = ""] = clean.split(".");
  return { currency, value: clean, units: BigInt(whole + fraction.padEnd(8, "0")) };
}

export function sameMoney(left: Money, right: Money) {
  return left.currency === right.currency && left.units === right.units;
}

export function normalized(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function deliverables(lines: Line[]) {
  return hits(lines, /^(D[1-9][0-9]*)\s*[—–-]\s*([^|]+)\|\s*([A-Z]{3})\s+([0-9,.]+)(?:\s*\|.*)?$/)
    .flatMap(({ match, citation }) => {
      const amount = money(match[3], match[4]);
      const title = match[2].trim();
      return amount && title ? [{ id: match[1], title, amount, citation }] : [];
    });
}

function documentKind(source: MatchSource, kind: string) {
  return (source.source_origin === "synthetic_replay" && source.source_kind === kind) ||
    (source.source_origin === "merchant_provided" && source.source_kind === "merchant_document");
}

export function scopeRecord(source: MatchSource) {
  if (!documentKind(source, "statement_of_work")) return;
  const lines = sourceLines(source);
  const project = one(lines, /^Statement of work:\s*([A-Za-z0-9_-]+)\s*(?:\||$)/i);
  const client = one(lines, /^Client:\s*([^|]+)\|\s*contact:\s*([^\s@]+@[^\s@]+)$/i);
  if (!project || !client || !client.match[1].trim()) return;
  const items = deliverables(lines);
  if (new Set(items.map((item) => item.id)).size !== items.length) return;
  return {
    project: project.match[1], projectCitation: project.citation,
    client: client.match[1].trim(), contact: client.match[2].toLowerCase(), clientCitation: client.citation, items,
  };
}

export function invoiceRecord(source: MatchSource) {
  if (!documentKind(source, "invoice")) return;
  const lines = sourceLines(source);
  const invoice = one(lines, /^Invoice\s+([A-Za-z0-9_-]+)\s*\|\s*project\s+([A-Za-z0-9_-]+)\s*(?:\||$)/i);
  const buyer = one(lines, /^Bill to:\s*(\S.*)$/i);
  const total = one(lines, /^Total due:\s*([A-Z]{3})\s+([0-9,.]+)$/);
  if (!invoice || !buyer || !total) return;
  const amount = money(total.match[1], total.match[2]);
  if (!amount) return;
  const items = deliverables(lines);
  if (new Set(items.map((item) => item.id)).size !== items.length) return;
  return {
    id: invoice.match[1], project: invoice.match[2], buyer: buyer.match[1],
    amount, items, citations: [invoice.citation, buyer.citation, total.citation],
  };
}

export function clientMail(source: MatchSource) {
  if (!documentKind(source, "client_correspondence")) return;
  const [date, sender, recipient, heading, ...body] = sourceLines(source);
  if (!/^Date:\s*\S/i.test(date?.text ?? "") || !/^To:\s*\S/i.test(recipient?.text ?? "")) return;
  const from = sender && one([sender], /^From:\s*([^\s@]+@[^\s@]+)$/i);
  const subject = heading && one([heading], /^Subject:\s*(?:Payment for ([A-Za-z0-9_-]+)|([A-Za-z0-9_-]+)\s*\/\s*\S.*)$/i);
  if (!from || !subject) return;
  const quote = body.findIndex(({ text }) => /^(?:On .+ wrote:|[-]+\s*(?:Original|Forwarded) Message\s*[-]+|Begin forwarded message:)/i.test(text));
  return {
    from: from.match[1].toLowerCase(), project: subject.match[1] ?? subject.match[2],
    citations: [from.citation, subject.citation], lines: quote < 0 ? body : body.slice(0, quote),
  };
}

export function handoffRecord(source: MatchSource) {
  if (!documentKind(source, "project_record")) return;
  const lines = sourceLines(source);
  const project = one(lines, /^Handoff confirmation\s*\|\s*project\s+([A-Za-z0-9_-]+)$/i);
  const receipt = one(lines, /^Recipient confirmed receipt of (?:the )?(.+?) \([^()]+\)\.$/i);
  if (project && receipt) {
    return { project: project.match[1], title: receipt.match[1], citations: [project.citation, receipt.citation] };
  }
}
