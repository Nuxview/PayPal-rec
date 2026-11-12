"use client";

import { useState, useTransition } from "react";
import type { GapAnalysisResult } from "../../../lib/ai/gemini-evidence";
import { Icon } from "../../ui";

export function EvidenceGapAnalysis({ enabled, analyze, sandbox = false }: {
  enabled: boolean;
  analyze: () => Promise<GapAnalysisResult>;
  sandbox?: boolean;
}) {
  const [result, setResult] = useState<GapAnalysisResult>();
  const [pending, startTransition] = useTransition();

  function runAnalysis() {
    setResult(undefined);
    startTransition(async () => {
      try {
        setResult(await analyze());
      } catch {
        setResult({ error: "Could not finish the analysis. Try again or continue with the evidence review." });
      }
    });
  }

  return (
    <section id="gemini-evidence-review" aria-labelledby="gemini-title" className="panel mb-8 scroll-mt-6 space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <p className="eyebrow">Gemini · Advisory</p>
          <h2 id="gemini-title" className="section-title">What’s missing from the evidence?</h2>
          <p className="detail-copy">Get a second pass on gaps and contradictions, with the records to check and what to gather next. These suggestions do not change decisions or enter the packet.</p>
        </div>
        {enabled && <button type="button" onClick={runAnalysis} disabled={pending} className="button button-primary">
          <Icon name="search" /> {pending ? "Analyzing evidence…" : result && "error" in result ? "Retry analysis" : "Analyze evidence"}
        </button>}
      </div>
      {enabled ? <p className="detail-copy">{sandbox
        ? "Running this sends excerpts of the case documents and limited capture details to Google Gemini. Use only synthetic or authorized Sandbox records."
        : "Running this sends fictional records and simulated capture details to Google Gemini."}</p>
        : <p className="detail-copy">Gemini is disabled for this workspace. You can still review and download the evidence.</p>}
      <p role="status" className={pending ? "feedback" : "sr-only"}>
        {pending ? "Checking the notice and supplied evidence for gaps." : result && "analysis" in result
          ? `Gemini analysis complete. ${result.analysis.findings.length} suggested follow-ups.` : ""}
      </p>
      {result && "error" in result && <p role="alert" className="feedback feedback-error">{result.error}</p>}
      {result && "analysis" in result && (
        <div aria-label="Gemini findings" className="space-y-3 border-t border-rule pt-4">
          <p className="detail-copy">Model: <span className="font-semibold">{result.analysis.model}</span>. Verify each suggestion against the notice and original records.</p>
          {result.analysis.limited && <p className="feedback feedback-warn">Some evidence was too long for this analysis. Check the full documents before treating a suggested gap as missing.</p>}
          {!result.analysis.findings.length && <p className="feedback">Gemini didn’t identify a concrete gap in the excerpts it reviewed. Check the complete notice and original documents before exporting.</p>}
          <ul className="grid gap-3 lg:grid-cols-2">
            {result.analysis.findings.map((item, index) => (
              <li key={index} className="min-w-0 space-y-3 rounded-lg bg-paper p-4">
                <p className="badge badge-warn">{item.request === "NOTICE" ? "Notice text" : `Request ${item.request}`} · {item.status === "missing" ? "Possible gap" : "Needs review"}</p>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="detail-copy">{item.observation}</p>
                <p className="detail-copy"><strong className="text-ink">Next step:</strong> {item.nextStep}</p>
                <details className="rounded-lg bg-white px-3">
                  <summary className="min-h-11 content-center py-2 text-sm font-semibold text-brand">Check source excerpts ({item.excerpts.length})</summary>
                  <ul className="space-y-3 pb-3">
                    {item.excerpts.map(({ id, sourceName, start, end, text }) => (
                      <li key={id} className="space-y-1 border-t border-rule pt-2">
                        <p className="detail-copy break-all">{sourceName} · {start === end ? `line ${start}` : `lines ${start}–${end}`}</p>
                        <pre className="whitespace-pre-wrap break-words text-sm">{text}</pre>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
