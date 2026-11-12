"use server";

import {
  analyzeEvidenceGaps, buildGapContext, gapAnalysisFailure, geminiConfig, publicGeminiEnabled, type GapAnalysisResult,
} from "../../../lib/ai/gemini-evidence";
import { loadAgencyFixture } from "../../../lib/evidence/agency-fixture";
import { parseRestrictionNotice } from "../../../lib/evidence/notice";
import { buildReviewSnapshot } from "../../../lib/evidence/review-snapshot";

const cacheForMs = 60 * 60_000;
const retryAfterMs = 30_000;
let cached: { key: string; until: number; result: Promise<GapAnalysisResult> } | undefined;

export async function analyzeDemoEvidence(version: string): Promise<GapAnalysisResult> {
  const config = geminiConfig();
  if (!config || !publicGeminiEnabled()) return { error: "Gemini is not enabled for the public demo." };

  try {
    const fixture = await loadAgencyFixture();
    const review = buildReviewSnapshot(fixture);
    if (version !== review.version) return { error: "The evidence changed. Reload this case and try again." };
    const key = `${config.model}:${review.version}`;
    if (cached?.key === key && cached.until > Date.now()) return cached.result;

    const source = fixture.sources.find(({ source_id }) => source_id === fixture.report.notice_source_id);
    if (!source) return { error: "The demo notice could not be loaded." };
    const notice = parseRestrictionNotice(source.source_id, source.source_content);
    const context = buildGapContext(fixture.sources, notice, fixture.report.payment_source_id, fixture.payment, review);
    const entry = {
      key, until: Date.now() + cacheForMs,
      result: analyzeEvidenceGaps(context, config).then((analysis) => ({ analysis })).catch((error: unknown) => {
        entry.until = Date.now() + retryAfterMs;
        return gapAnalysisFailure(error);
      }),
    };
    cached = entry;
    return entry.result;
  } catch (error) {
    return gapAnalysisFailure(error);
  }
}
