type Citation = { source_id: string; start_line: number; end_line: number };
type CitedText = { text: string; citation: Citation };
type NoticeRequest = CitedText & { label: string };
type Field = "case_reference" | "dated" | "recipient" | "payment_under_review" | "reason" | "deadline";

const fieldNames: Record<string, Field> = {
  "case reference": "case_reference",
  dated: "dated",
  to: "recipient",
  "payment under review": "payment_under_review",
  reason: "reason",
  deadline: "deadline",
};

export const noticeParserVersion = 1;

export class NoticeCaptureError extends Error {}

export function parseRestrictionNotice(sourceId: string, content: string) {
  const fields: Record<Field, CitedText | null> = {
    case_reference: null, dated: null, recipient: null, payment_under_review: null, reason: null, deadline: null,
  };
  const seenFields = new Set<Field>();
  const requests = new Map<string, NoticeRequest | null>();
  const unresolved = new Set<number>();
  const seenRequestLines = new Map<string, number>();
  let inList = false;
  let listStarted = false;

  const lines = content.split(/\r\n|\r|\n/);
  for (const [index, original] of lines.entries()) {
    const line = original.trim();
    const n = index + 1;
    const citation = { source_id: sourceId, start_line: n, end_line: n };

    const header = /^(Case reference|Dated|To|Payment under review|Reason|Deadline):\s*(.*)$/i.exec(line);
    if (header) {
      const field = fieldNames[header[1].toLowerCase()];
      fields[field] = header[2] && !seenFields.has(field) ? { text: header[2], citation } : null;
      seenFields.add(field);
      inList = false;
      continue;
    }

    const explicit = /^(R[1-9][0-9]{0,5}):\s*(.*)$/i.exec(line);
    if (explicit) {
      const label = explicit[1].toUpperCase();
      const earlier = seenRequestLines.get(label);
      if (earlier !== undefined || !explicit[2]) {
        if (earlier !== undefined) unresolved.add(earlier);
        unresolved.add(n);
        requests.set(label, null);
      } else {
        requests.set(label, { label, text: explicit[2], citation });
      }
      seenRequestLines.set(label, n);
      inList = false;
      continue;
    }

    if (/^(Requested documents|Requested information|Requests):$/i.test(line)) {
      inList = true;
      listStarted = false;
      continue;
    }
    if (!inList) continue;
    if (!line && !listStarted) continue;
    const bullet = /^(?:[-*•]|[0-9]{1,4}[.)])\s+(\S.*)$/u.exec(line);
    if (bullet) {
      const label = `L${n}`;
      requests.set(label, { label, text: bullet[1], citation });
      listStarted = true;
    } else {
      if (line) unresolved.add(n);
      inList = false;
    }
  }

  const items = [...requests.values()].filter((item): item is NoticeRequest => item !== null);
  return {
    source_id: sourceId,
    fields,
    request_state: !items.length ? "unknown" : unresolved.size ? "partial" : "extracted",
    requests: items,
    unresolved_lines: [...unresolved].sort((a, b) => a - b),
  } as const;
}
