import type { parseRestrictionNotice } from "../../../lib/evidence/notice";
import type { SandboxReviewEvent } from "../../../lib/evidence/mongo-sandbox-case";
import type { ReviewCitation, ReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import type { ReviewDecisions } from "../../../lib/evidence/review-state";
import { ActionButton } from "../../action-button";
import { Icon } from "../../ui";
import { saveDemoDecision } from "./actions";
import { DownloadPacket } from "./download-packet";

export function CitationInspector({ citations, group }: { citations: ReviewCitation[]; group: string }) {
  if (!citations.length) return null;
  const sources = Map.groupBy(citations, ({ sourceId }) => sourceId);

  return (
    <details className="mt-4 min-w-0 rounded-lg bg-paper">
      <summary className="min-h-11 content-center rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-leaf">
        Inspect citations ({sources.size} sources · {citations.length} citations)
      </summary>
      <div className="grid gap-2 border-t border-rule p-3">
        {[...sources].map(([sourceId, excerpts]) => (
          <details key={sourceId} name={group} className="min-w-0 rounded-lg bg-white">
            <summary className="min-h-11 content-center break-all px-3 py-2 text-sm font-semibold text-brand">
              {sourceId} · {excerpts[0].name} ({excerpts.length} citations)
            </summary>
            {excerpts.map((citation) => (
              <figure key={citation.location} className="px-3 pb-3">
                <figcaption className="break-all text-sm font-semibold text-muted">{citation.location}</figcaption>
                {citation.lines ? (
                  <ol className="mt-2 space-y-1 text-sm leading-relaxed">
                    {citation.lines.map(({ number, text }) => (
                      <li key={number} className="grid grid-cols-[minmax(2ch,auto)_minmax(0,1fr)] gap-2">
                        <span className="text-right font-mono text-muted">{number}</span>
                        <code className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</code>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-sm leading-relaxed">{citation.value}</pre>
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
  sandbox?: {
    caseId: string; save: (data: FormData) => Promise<void>; serial: string; canDecide: boolean; editable: boolean;
    currentEvents?: ReadonlyMap<string, SandboxReviewEvent>;
  };
}) {
  const counts = review.proposals.reduce((count, { id }) => {
    count[decisions[id] ?? "pending"]++;
    return count;
  }, { pending: 0, accepted: 0, rejected: 0 });

  const message = feedback === "saved"
    ? sandbox || counts.accepted + counts.rejected > 0
      ? "Decision saved."
      : "Your browser did not keep the decision. Allow cookies for this site and try again."
    : feedback === "undone" ? "Decision cleared. The statement is pending again."
    : feedback === "changed" ? "The case changed. Check the current evidence and decisions before continuing."
    : feedback === "invalid" ? "That decision could not be saved. Try again from a proposal below."
    : feedback === "empty" ? "Accept at least one proposal before downloading."
    : feedback === "export-failed" ? "The packet could not be generated. Try downloading again."
    : null;
  const error = ["changed", "invalid", "empty", "export-failed"].includes(String(feedback));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="panel space-y-4 p-4 lg:sticky lg:top-6" aria-label="Review progress">
        <nav aria-label="Review steps">
          <ol className="grid gap-1 text-sm sm:grid-cols-3 lg:grid-cols-1">
            <li><a href="#case-context" className="button button-quiet w-full justify-start">1. Read the case</a></li>
            <li><a href="#review-requests" className="button button-secondary w-full justify-start">2. Review requests</a></li>
            <li><a href="#packet-download" className="button button-quiet w-full justify-start">3. Download draft</a></li>
          </ol>
        </nav>
        <dl aria-live="polite" className="grid grid-cols-3 gap-2 border-t border-rule pt-4 text-center text-sm">
          <div><dt className="text-muted">Pending</dt><dd className="text-xl font-semibold tabular-nums">{counts.pending}</dd></div>
          <div><dt className="text-muted">Accepted</dt><dd className="text-xl font-semibold tabular-nums text-brand">{counts.accepted}</dd></div>
          <div><dt className="text-muted">Rejected</dt><dd className="text-xl font-semibold tabular-nums text-danger">{counts.rejected}</dd></div>
        </dl>
        <p className="detail-copy">{sandbox ? "Sandbox decisions are saved on the server." : "Decisions are saved in this browser."}</p>
        {message && <p role={error ? "alert" : "status"} className={`feedback ${error ? "feedback-error" : ""}`}>{message}</p>}
      </aside>
      <div className="min-w-0 space-y-8">
        <section id="review-requests" aria-labelledby="requests-title" className="scroll-mt-6 space-y-4">
          <h2 id="requests-title" className="section-title">Review the notice requests</h2>
          <p className="body-copy">Check each statement’s citations, then accept it for the draft or reject it. Unresolved items stay open.</p>
          {!requests.length && <p className="feedback feedback-warn">No explicit requests could be read from the notice. Check the source notice before preparing a response.</p>}
          {requests.map((request) => {
            const proposals = review.proposals.filter((item) => item.request === request.label);
            const followUp = review.followUp.filter((item) => item.request === request.label);
            return (
              <section key={request.label} id={`request-${request.label}`} aria-labelledby={`request-title-${request.label}`} className="panel scroll-mt-6 overflow-hidden">
                <header className="space-y-2 border-b border-rule bg-[#f0f5ee] p-5">
                  <p className="eyebrow">Request {request.label}</p>
                  <h3 id={`request-title-${request.label}`} className="font-semibold">{request.text}</h3>
                  <p className="detail-copy break-all">Notice {request.citation.source_id} · line {request.citation.start_line}</p>
                </header>
                <div className="divide-y divide-rule">
                  {!proposals.length && !followUp.length && <p className="p-5 text-sm text-warn">No supporting statement has been proposed for this request. It still needs review.</p>}
                  {proposals.map((item) => {
                    const decision = Object.hasOwn(decisions, item.id) ? decisions[item.id] : "pending";
                    const event = sandbox?.currentEvents?.get(item.id);
                    return (
                      <article key={item.id} aria-label={item.title} className="p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-semibold">{item.title}</h4>
                          <span className={`badge ${decision === "accepted" ? "" : decision === "rejected" ? "bg-blush text-danger" : "badge-neutral"}`}>
                            {decisionLabel[decision]}
                          </span>
                        </div>
                        <p className="detail-copy mt-2">{item.statement}</p>
                        {event && <p className="detail-copy mt-2">
                          {decision === "pending" ? "Cleared" : decisionLabel[decision]} by {event.reviewer} · <time>{event.at.toISOString()}</time>
                        </p>}
                        <CitationInspector citations={item.citations} group={item.id} />
                        {(!sandbox || sandbox.canDecide) && <form action={sandbox?.save ?? saveDemoDecision} className="mt-4 flex flex-wrap gap-2">
                          {sandbox && <input type="hidden" name="case" value={sandbox.caseId} />}
                          {sandbox && <input type="hidden" name="serial" value={sandbox.serial} />}
                          <input type="hidden" name="proposal" value={item.id} />
                          <input type="hidden" name="version" value={review.version} />
                          {([["accepted", "Accept"], ["rejected", "Reject"], ["pending", "Undo"]] as const).map(([choice, label]) => {
                            if (choice === "pending" && decision === "pending") return null;
                            return <ActionButton key={choice} type="submit" name="decision" value={choice} busy="Saving…"
                              aria-label={`${label} ${item.title}`} aria-pressed={choice === "pending" ? undefined : decision === choice}
                              disabled={choice === decision}
                              className={`button ${choice === "accepted" ? "button-primary" : choice === "rejected" ? "button-secondary" : "button-quiet"}`}>
                              {label}
                            </ActionButton>;
                          })}
                        </form>}
                      </article>
                    );
                  })}
                  {followUp.map((item) => (
                    <article key={item.id} className="p-5">
                      <p className="badge badge-warn">{item.status === "review_required" ? "Needs explanation" : "Missing evidence"}</p>
                      <h4 className="mt-2 font-semibold">{item.title}</h4>
                      <p className="detail-copy mt-2">{item.statement}</p>
                      {item.explanation && <p className="detail-copy mt-2">Client’s explanation: “{item.explanation}”</p>}
                      <p className="feedback feedback-warn mt-3">{item.nextEvidence}</p>
                      <CitationInspector citations={item.citations} group={item.id} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </section>
        {review.excluded.length > 0 && (
          <section aria-labelledby="excluded-title" className="space-y-3">
            <h2 id="excluded-title" className="section-title">Excluded records</h2>
            <p className="detail-copy">These records are outside the proposed statements and are left out of the packet.</p>
            {review.excluded.map((item) => (
              <article key={item.sourceId} className="panel p-5">
                <p className="badge badge-neutral">Different project</p>
                <h3 className="mt-2 break-all font-semibold">{item.name}</h3>
                <CitationInspector citations={item.citations} group={item.sourceId} />
              </article>
            ))}
          </section>
        )}
        <section aria-labelledby="download-title" className="space-y-3">
          <h2 id="download-title" className="section-title">Download your draft</h2>
          <DownloadPacket
            key={JSON.stringify(decisions)}
            path={sandbox ? `/sandbox/cases/${sandbox.caseId}/packet` : "/api/demo/reviewed-packet"}
            accepted={counts.accepted}
            selection={sandbox ? undefined : JSON.stringify({ version: review.version, decisions })}
            version={sandbox ? review.version : undefined}
            serial={sandbox?.serial}
          />
          <details className="rounded-lg bg-leaf px-4">
            <summary className="min-h-11 content-center py-2 text-sm font-semibold text-brand">What happens after download?</summary>
            <div className="space-y-2 pb-4">
              <p className="detail-copy">{sandbox ? "This is a test draft. For an actual limitation, use the instructions in your PayPal case to submit original records." : "Use this fictional case to practice. For a real limitation, review any open follow-ups and submit the requested original records through PayPal."}</p>
              {sandbox?.editable && <a href="#case-edit" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">Update case evidence <Icon name="arrow" /></a>}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
