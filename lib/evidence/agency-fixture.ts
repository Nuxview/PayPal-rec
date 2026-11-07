import { loadReplayPayment } from "../paypal/replay.ts";
import { loadFixtureDocuments } from "./documents.ts";
import { proposeEvidenceMatches } from "./match.ts";
import { parseRestrictionNotice } from "./notice.ts";
import { type MatchSource } from "./match-records.ts";

export async function loadAgencyFixture() {
  const documents = await loadFixtureDocuments();
  const notice = documents.find(({ source_kind }) => source_kind === "merchant_provided_simulated_notice");
  if (!notice) throw new Error("No simulated notice was found in the agency fixture.");
  const payment = loadReplayPayment();
  const paymentSourceId = "SRC-02";
  const sources: MatchSource[] = [...documents, {
    source_id: paymentSourceId,
    source_kind: "paypal_payment_fixture",
    source_origin: payment.source_mode,
    source_content: JSON.stringify(payment),
  }];
  const report = proposeEvidenceMatches(
    sources, parseRestrictionNotice(notice.source_id, notice.source_content), paymentSourceId,
  );
  return {
    report,
    payment,
    sources: sources.map((source) => ({
      ...source,
      source_name: documents.find(({ source_id }) => source_id === source.source_id)?.source_name ?? "paypal-payment.json",
    })),
  };
}
