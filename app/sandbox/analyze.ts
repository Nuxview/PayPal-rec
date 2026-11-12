"use server";

import { analyzeEvidenceGaps, buildGapContext, gapAnalysisFailure, geminiConfig, type GapAnalysisResult } from "../../lib/ai/gemini-evidence";
import { caseUuid } from "../../lib/evidence/sandbox-case";
import { authorizedSandbox, sandboxCaseStore } from "./access";

export async function analyzeSandboxEvidence(caseId: string, version: string): Promise<GapAnalysisResult> {
  const access = await authorizedSandbox();
  if (!access || typeof caseId !== "string" || !caseUuid.test(caseId)) {
    return { error: "Unlock the Sandbox workspace and reopen the case before running Gemini." };
  }
  const config = geminiConfig();
  if (!config) return { error: "Gemini is not configured for this workspace." };

  try {
    const { review, sources, notice, payment, paymentSourceId } = await sandboxCaseStore(access.database).loadReview(caseId);
    if (version !== review.version) return { error: "The evidence changed. Reload this case and try again." };
    return { analysis: await analyzeEvidenceGaps(buildGapContext(sources, notice, paymentSourceId, payment, review), config) };
  } catch (error) {
    return gapAnalysisFailure(error);
  }
}
