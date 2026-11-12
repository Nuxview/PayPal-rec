export type ReviewDecision = "accepted" | "rejected";
export type ReviewDecisions = Record<string, ReviewDecision>;
export const agencyReviewCookie = "paypal-rec-agency-review";

export type ReviewTarget = {
  version: string;
  proposals: { id: string }[];
};

export function readReviewDecisions(raw: string | null, target: ReviewTarget): ReviewDecisions {
  if (!raw) return {};
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== target.version || !saved.decisions || typeof saved.decisions !== "object" ||
      Array.isArray(saved.decisions)) return {};
    return Object.fromEntries(target.proposals.flatMap(({ id }) => {
      const decision = Object.hasOwn(saved.decisions, id) ? saved.decisions[id] : undefined;
      return decision === "accepted" || decision === "rejected" ? [[id, decision]] : [];
    }));
  } catch {
    return {};
  }
}

export function writeReviewDecision(
  raw: string | null, target: ReviewTarget, id: string, decision: ReviewDecision | "pending",
): string | null {
  if (!target.proposals.some((proposal) => proposal.id === id) ||
    (decision !== "accepted" && decision !== "rejected" && decision !== "pending")) return null;
  const decisions = readReviewDecisions(raw, target);
  if (decision === "pending") delete decisions[id];
  else decisions[id] = decision;
  return JSON.stringify({ version: target.version, decisions });
}
