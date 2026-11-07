import { type ReviewSnapshot } from "./review-snapshot.ts";
import { type ReviewDecision } from "./review-state.ts";

export class PacketError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const packetFilename = "paypal-rec-reviewed-evidence.zip";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildEvidencePacket(review: ReviewSnapshot, input: unknown) {
  if (!record(input) || typeof input.version !== "string" || !record(input.decisions)) {
    throw new PacketError("Provide a valid review and its decisions.", 400);
  }
  if (input.version !== review.version) {
    throw new PacketError("The evidence changed. Reload the review and check the proposals again.", 409);
  }
  const ids = new Set(review.proposals.map(({ id }) => id));
  const decisions = new Map<string, ReviewDecision>();
  for (const [id, value] of Object.entries(input.decisions)) {
    if (!ids.has(id) || (value !== "accepted" && value !== "rejected")) {
      throw new PacketError("A decision does not belong to this review.", 400);
    }
    decisions.set(id, value);
  }
  const accepted = review.proposals.filter(({ id }) => decisions.get(id) === "accepted");
  if (!accepted.length) throw new PacketError("Accept at least one proposal before downloading a packet.", 422);
  if (accepted.some(({ citations }) => !citations.length)) {
    throw new PacketError("An accepted proposal is missing its citations. Reload and review it again.", 409);
  }

  return {
    schema_version: 1,
    mode: review.mode,
    review_version: review.version,
    capture_id: review.captureId,
    accepted_claims: accepted.map(({ id, request, title, statement, citations }) => ({
      id, request, title, statement, citations,
    })),
    gaps: review.followUp.map(({ request, title, status, nextEvidence }) => ({
      request, title, status, next_evidence: nextEvidence,
    })),
    omitted_proposals: review.proposals.filter(({ id }) => decisions.get(id) !== "accepted")
      .map(({ id, request, title }) => ({ request, title, status: decisions.get(id) ?? "pending" })),
  };
}

export type EvidencePacket = ReturnType<typeof buildEvidencePacket>;
