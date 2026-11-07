import type { ReviewCitation, ReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import type { ReviewDecisions } from "../../../lib/evidence/review-state";
import { saveDemoDecision } from "./actions";

const focusStyle = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300";

function CitationInspector({ citations, group }: { citations: ReviewCitation[]; group: string }) {
  if (!citations.length) return null;

  return (
    <details className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70">
      <summary className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-semibold text-sky-200 hover:bg-slate-800 ${focusStyle}`}>
        Inspect citations ({citations.length})
      </summary>
      <div className="grid gap-2 border-t border-slate-800 p-3">
        {citations.map((citation) => (
          <details key={`${citation.sourceId}:${citation.location}`} name={group}
            className="min-w-0 rounded-md border border-slate-800 bg-slate-900">
            <summary className={`cursor-pointer rounded-md px-3 py-2 text-xs text-sky-100 ${focusStyle}`}>
              {citation.sourceId} · {citation.location}
            </summary>
            <figure className="px-3 pb-3">
              <figcaption className="break-all text-xs font-medium text-slate-300">{citation.name}</figcaption>
              {citation.lines ? (
                <ol className="mt-2 space-y-1 text-xs leading-relaxed">
                  {citation.lines.map(({ number, text }) => (
                    <li key={number} className="grid grid-cols-[2ch_minmax(0,1fr)] gap-2">
                      <span className="text-right font-mono text-slate-400">{number}</span>
                      <code className="whitespace-pre-wrap [overflow-wrap:anywhere] text-slate-100">{text}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-relaxed text-slate-100">{citation.value}</pre>
              )}
            </figure>
          </details>
        ))}
      </div>
    </details>
  );
}

const decisionLabel = { accepted: "Accepted", rejected: "Rejected", pending: "Pending" };

export function ReviewWorkspace({ review, decisions, feedback }: {
  review: ReviewSnapshot; decisions: ReviewDecisions; feedback?: string | string[];
}) {
  const counts = review.proposals.reduce((count, { id }) => {
    count[decisions[id] ?? "pending"]++;
    return count;
  }, { pending: 0, accepted: 0, rejected: 0 });

  const message = feedback === "saved"
    ? counts.accepted + counts.rejected > 0
      ? "Decision saved."
      : "Your browser did not keep the decision. Allow cookies for this site and try again."
    : feedback === "changed" ? "The evidence changed. Review the updated proposals before downloading."
    : feedback === "invalid" ? "That decision could not be saved. Try again from a proposal below."
    : feedback === "empty" ? "Accept at least one proposal before downloading."
    : feedback === "export-failed" ? "The packet could not be generated. Try downloading again."
    : null;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-sm text-slate-300">
          Demo decisions are saved in this browser.
        </p>
        <dl aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Pending</dt><dd className="font-semibold tabular-nums">{counts.pending}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Accepted</dt><dd className="font-semibold tabular-nums text-emerald-300">{counts.accepted}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Rejected</dt><dd className="font-semibold tabular-nums text-rose-300">{counts.rejected}</dd></div>
        </dl>
      </div>
      <form method="post" action="/api/demo/reviewed-packet" aria-label="Download reviewed packet"
        className="mb-8 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <input type="hidden" name="review" value={JSON.stringify({ version: review.version, decisions })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-300">
            {counts.accepted
              ? "The ZIP includes a PDF, structured JSON, and a list of open gaps. Nothing is sent to PayPal."
              : "Accept at least one proposal to download a reviewed packet."}
          </p>
          <button
            type="submit"
            disabled={!counts.accepted}
            className={`rounded-md bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 ${focusStyle}`}
          >
            Download reviewed packet
          </button>
        </div>
        {message && <p role="status" className="mt-3 text-sm text-sky-200">{message}</p>}
      </form>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="proposals-title" className="min-w-0">
          <h2 id="proposals-title" className="text-xl font-semibold">Proposed matches</h2>
          {!review.proposals.length && <p className="mt-3 text-sm text-slate-400">No supported matches were proposed.</p>}
          <div className="mt-4 space-y-4">
            {review.proposals.map((item) => {
              const decision = decisions[item.id] ?? "pending";
              return (
                <article key={item.id} aria-label={item.title} className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-sky-300">Request {item.request}</p>
                      <h3 className="mt-1 font-semibold">{item.title}</h3>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decision === "accepted"
                      ? "bg-emerald-400/15 text-emerald-200" : decision === "rejected"
                        ? "bg-rose-400/15 text-rose-200" : "bg-slate-800 text-slate-200"}`}>
                      {decisionLabel[decision]}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-relaxed text-slate-300">{item.statement}</p>
                  <CitationInspector citations={item.citations} group={item.id} />
                  <form action={saveDemoDecision} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="proposal" value={item.id} />
                    <input type="hidden" name="version" value={review.version} />
                    {(["accepted", "rejected"] as const).map((choice) => {
                      const label = choice === "accepted" ? "Accept" : "Reject";
                      return (
                        <button
                          key={choice}
                          type="submit"
                          name="decision"
                          value={choice}
                          aria-label={`${label} ${item.title}`}
                          aria-pressed={decision === choice}
                          className={`rounded-md border px-3 py-2 text-sm font-semibold ${focusStyle} ${choice === "accepted"
                            ? "border-emerald-400/50 text-emerald-200 hover:bg-emerald-400/15 aria-pressed:bg-emerald-400/20"
                            : "border-slate-600 text-slate-200 hover:bg-slate-800 aria-pressed:border-rose-400/60 aria-pressed:bg-rose-400/15 aria-pressed:text-rose-200"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </form>
                </article>
              );
            })}
          </div>
        </section>
        <aside aria-labelledby="followup-title" className="min-w-0">
          <h2 id="followup-title" className="text-xl font-semibold">Needs follow-up</h2>
          <div className="mt-4 space-y-4">
            {review.followUp.map((item) => (
              <article key={item.id} className="rounded-xl border border-amber-300/20 bg-slate-900 p-4">
                <p className="text-xs font-semibold text-amber-200">
                  Request {item.request} · {item.status === "review_required" ? "Needs review" : "Missing evidence"}
                </p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.statement}</p>
                {item.explanation && <p className="mt-2 text-sm text-slate-300">Client’s explanation: “{item.explanation}”</p>}
                <p className="mt-3 text-sm text-amber-100">{item.nextEvidence}</p>
                <CitationInspector citations={item.citations} group={item.id} />
              </article>
            ))}
            {review.excluded.map((item) => (
              <article key={item.sourceId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-semibold text-slate-400">Excluded · Different project</p>
                <h3 className="mt-1 break-all text-sm font-semibold">{item.name}</h3>
                <CitationInspector citations={item.citations} group={item.sourceId} />
              </article>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
