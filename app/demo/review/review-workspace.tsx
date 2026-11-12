import type { parseRestrictionNotice } from "../../../lib/evidence/notice";
import Link from "next/link";
import type { ReviewCitation, ReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import type { ReviewDecisions } from "../../../lib/evidence/review-state";
import { saveDemoDecision } from "./actions";

const focusStyle = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300";

function CitationInspector({ citations, group }: { citations: ReviewCitation[]; group: string }) {
  if (!citations.length) return null;
  const sources = Map.groupBy(citations, ({ sourceId }) => sourceId);

  return (
    <details className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70">
      <summary className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-semibold text-sky-200 hover:bg-slate-800 ${focusStyle}`}>
        Inspect citations ({sources.size} sources · {citations.length} citations)
      </summary>
      <div className="grid gap-2 border-t border-slate-800 p-3">
        <p className="text-xs text-slate-400">Grouped by document. Expand a source to read its exact excerpts.</p>
        {[...sources].map(([sourceId, excerpts]) => (
          <details key={sourceId} name={group}
            className="min-w-0 rounded-md border border-slate-800 bg-slate-900">
            <summary className={`cursor-pointer break-all rounded-md px-3 py-2 text-xs text-sky-100 ${focusStyle}`}>
              {sourceId} · {excerpts[0].name} ({excerpts.length} citations)
            </summary>
            {excerpts.map((citation) => (
              <figure key={citation.location} className="px-3 pb-3">
                <figcaption className="break-all text-xs font-medium text-slate-300">{citation.location}</figcaption>
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
            ))}
          </details>
        ))}
      </div>
    </details>
  );
}

const decisionLabel = { accepted: "Accepted", rejected: "Rejected", pending: "Pending" };

export function ReviewWorkspace({ review, requests, decisions, feedback, sandbox }: {
  requests: ReturnType<typeof parseRestrictionNotice>["requests"];
  review: ReviewSnapshot; decisions: ReviewDecisions; feedback?: string | string[];
  sandbox?: { caseId: string; save: (data: FormData) => Promise<void> };
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
          {sandbox ? "Sandbox review decisions are saved in this browser." : "Demo decisions are saved in this browser."}
        </p>
        <dl aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Pending</dt><dd className="font-semibold tabular-nums">{counts.pending}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Accepted</dt><dd className="font-semibold tabular-nums text-emerald-300">{counts.accepted}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-slate-400">Rejected</dt><dd className="font-semibold tabular-nums text-rose-300">{counts.rejected}</dd></div>
        </dl>
      </div>
      {message && <p role="status" className="mb-5 text-sm text-sky-200">{message}</p>}
      <nav aria-label="Review steps" className="mb-8">
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li><a href="#case-context" className="text-sky-200 underline underline-offset-4">1. Read the case</a></li>
          <li><a href="#review-requests" className="text-sky-200 underline underline-offset-4">2. Review each request</a></li>
          <li><a href="#packet-download" className="text-sky-200 underline underline-offset-4">3. Download your draft</a></li>
        </ol>
      </nav>
      <section id="review-requests" aria-labelledby="requests-title" className="mb-8 scroll-mt-6">
        <h2 id="requests-title" className="text-2xl font-semibold">Review the notice requests</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
          Work through the requests in order. Read each proposed statement and use Inspect citations to read its original source excerpts.
          Accept includes that statement in the draft; Reject leaves it out. Leave it pending if you are unsure.
          Items needing explanation or more evidence stay open even when you accept another statement.
        </p>
        {!requests.length && <p className="mt-4 text-sm text-amber-100">No explicit requests could be read from the notice. Check the supplied notice before preparing a response.</p>}
        <div className="mt-6 space-y-8">
          {requests.map((request) => {
            const proposals = review.proposals.filter((item) => item.request === request.label);
            const followUp = review.followUp.filter((item) => item.request === request.label);
            return (
              <section key={request.label} id={`request-${request.label}`} aria-labelledby={`request-title-${request.label}`} className="scroll-mt-6 rounded-xl border border-slate-700 p-4 sm:p-5">
                <h3 id={`request-title-${request.label}`} className="text-lg font-semibold text-sky-200">Request {request.label}</h3>
                <p className="mt-2 text-sm text-slate-200">{request.text}</p>
                <p className="mt-1 text-xs text-slate-400">Notice {request.citation.source_id} · line {request.citation.start_line}</p>
                {!proposals.length && !followUp.length && <p className="mt-4 text-sm text-amber-100">No supporting statement has been proposed for this request. It still needs review.</p>}
                <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
                  {proposals.map((item) => {
                    const decision = decisions[item.id] ?? "pending";
                    return (
                      <article key={item.id} aria-label={item.title} className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-sky-300">Proposed statement</p>
                            <h4 className="mt-1 font-semibold">{item.title}</h4>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decision === "accepted"
                            ? "bg-emerald-400/15 text-emerald-200" : decision === "rejected"
                              ? "bg-rose-400/15 text-rose-200" : "bg-slate-800 text-slate-200"}`}>
                            {decisionLabel[decision]}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm leading-relaxed text-slate-300">{item.statement}</p>
                        <CitationInspector citations={item.citations} group={item.id} />
                        <form action={sandbox?.save ?? saveDemoDecision} className="mt-4 flex flex-wrap gap-2">
                          {sandbox && <input type="hidden" name="case" value={sandbox.caseId} />}
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
                  {followUp.map((item) => (
                    <article key={item.id} className="rounded-xl border border-amber-300/20 bg-slate-900 p-4">
                      <p className="text-xs font-semibold text-amber-200">
                        {item.status === "review_required" ? "Needs explanation" : "Missing evidence"}
                      </p>
                      <h4 className="mt-1 font-semibold">{item.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.statement}</p>
                      {item.explanation && <p className="mt-2 text-sm text-slate-300">Client’s explanation: “{item.explanation}”</p>}
                      <p className="mt-3 text-sm text-amber-100">{item.nextEvidence}</p>
                      <CitationInspector citations={item.citations} group={item.id} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
      {review.excluded.length > 0 && (
        <section aria-labelledby="excluded-title" className="mb-8">
          <h2 id="excluded-title" className="text-xl font-semibold">Excluded records</h2>
          <p className="mt-2 text-sm text-slate-300">These records are outside the proposed statements and are left out of the packet.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {review.excluded.map((item) => (
              <article key={item.sourceId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-semibold text-slate-400">Excluded · Different project</p>
                <h3 className="mt-1 break-all text-sm font-semibold">{item.name}</h3>
                <CitationInspector citations={item.citations} group={item.sourceId} />
              </article>
            ))}
          </div>
        </section>
      )}
      <h2 className="mb-3 text-2xl font-semibold">Download your draft</h2>
      <p className="mb-4 text-sm text-slate-300">Check the open items above, then download the statements you accepted together with their evidence and follow-ups.</p>
      <form id="packet-download" method="post" action={sandbox ? `/sandbox/cases/${sandbox.caseId}/packet` : "/api/demo/reviewed-packet"} aria-label="Download reviewed packet"
        className="scroll-mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        {!sandbox && <input type="hidden" name="review" value={JSON.stringify({ version: review.version, decisions })} />}
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
      </form>
      <section aria-labelledby="next-steps-title" className="mt-6 rounded-xl border border-slate-700 p-5">
        <h2 id="next-steps-title" className="text-xl font-semibold">What happens after download?</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Read the draft and its open follow-ups. Gather missing original records or clarify unresolved points before preparing your response.</li>
          <li>{sandbox ? "This Sandbox download is a test draft. For an actual limitation, the merchant submits the requested original records directly through PayPal, following that case’s instructions. Sandbox records are for practice; this app does not submit evidence or remove limitations." : "This demo uses fictional records for practice. Nothing is submitted to PayPal."}</li>
          {sandbox && <li>To test more evidence, import a new case with the same capture, the notice and the complete updated document set. Existing cases cannot be edited in this prototype, and earlier decisions do not carry over.</li>}
        </ol>
        {sandbox && <Link href="/sandbox" className="mt-4 inline-block text-sm text-sky-300 underline">Import an updated evidence set as a new case</Link>}
      </section>
    </>
  );
}
