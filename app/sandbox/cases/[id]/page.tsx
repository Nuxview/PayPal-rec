import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { evidenceAIConfig, evidenceProviderName } from "../../../../lib/ai/evidence-analysis";
import { loadMongoSandboxState, mongoSandboxCases, mongoSandboxPackets } from "../../../../lib/evidence/mongo-sandbox-case";
import { caseUuid, sandboxMerchant } from "../../../../lib/evidence/sandbox-case";
import { reviewersConfigured } from "../../../../lib/paypal/reviewer-access";
import { ActionButton } from "../../../action-button";
import { Icon, PageHeader } from "../../../ui";
import { EvidenceGapAnalysis } from "../../../demo/review/gap-analysis";
import { CitationInspector, ReviewWorkspace } from "../../../demo/review/review-workspace";
import { authorizedSandbox, sandboxCaseStore, sandboxReviewer } from "../../access";
import { analyzeSandboxEvidence } from "../../analyze";
import { archiveSandboxCase, saveSandboxDecision, signInSandboxReviewer, signOutSandboxReviewer, updateSandboxCase } from "../../actions";

export const metadata = { title: "Review Sandbox evidence | PayPal Rec" };

export default async function SandboxCase({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ review?: string | string[]; problem?: string | string[] }>;
}) {
  const access = await authorizedSandbox();
  if (!access) redirect("/sandbox");
  const { id } = await params;
  if (!caseUuid.test(id)) notFound();
  const database = access.database;
  const [loaded, reviewer, query, packets] = await Promise.all([
    typeof database === "string"
      ? sandboxCaseStore(database).loadReview(id).then((data) => ({ data, trusted: null })).catch(() => null)
      : Promise.resolve().then(() => loadMongoSandboxState(mongoSandboxCases(database), id))
        .then((trusted) => ({ data: trusted, trusted })).catch(() => null),
    sandboxReviewer(access.key),
    searchParams,
    typeof database === "string" ? [] : Promise.resolve().then(() =>
      mongoSandboxPackets(database).find({ caseId: id, merchantKey: sandboxMerchant },
        { projection: { serial: 1, version: 1, exportedAt: 1 } }).sort({ exportedAt: -1 }).limit(20).toArray(),
    ).catch(() => null),
  ]);
  const data = loaded?.data;
  if (!data) {
    return (
      <main id="main" className="shell pb-16">
        <PageHeader label="PayPal Sandbox" title="Case unavailable">
          Check that this case still exists, then reopen it from the workspace.
        </PageHeader>
        <Link href="/sandbox" className="button button-primary">Back to Sandbox workspace</Link>
      </main>
    );
  }
  const { review, payment, notice } = data;
  const aiConfig = evidenceAIConfig();
  const trusted = loaded.trusted;
  const serial = trusted?.row.serial ?? "";
  const latestRevision = trusted?.row.revisions?.at(-1);
  const caseFields = <>
    <input type="hidden" name="case" value={id} />
    <input type="hidden" name="version" value={review.version} />
    <input type="hidden" name="serial" value={serial} />
  </>;

  return (
    <main id="main" className="shell pb-16">
      <PageHeader label="PayPal Sandbox · Test capture" title="Review Sandbox evidence" action={
        <Link href="/sandbox" className="button button-secondary">Back to workspace <Icon name="arrow" /></Link>
      }>
        Review the PayPal Sandbox capture alongside the simulated notice and records you provided.
      </PageHeader>
      <section id="case-context" aria-labelledby="context-title" className="panel mb-8 scroll-mt-6 space-y-4 p-5 sm:p-6">
        <h2 id="context-title" className="section-title">Case payment</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted">Capture</dt><dd className="break-all font-mono">{payment.transaction_id}</dd></div>
          <div><dt className="text-muted">Amount</dt><dd className="font-semibold">{review.amount}</dd></div>
          <div><dt className="text-muted">Status</dt><dd>{payment.capture_status}</dd></div>
          <div><dt className="text-muted">Payer</dt><dd>{payment.payer?.name ?? "Not available"}</dd></div>
        </dl>
        {!review.proposals.length && (
          <p className="feedback feedback-warn">
            No supported matches were found. Check that the notice names this capture and amount, and that the invoices and client correspondence link to the same project.
          </p>
        )}
      </section>
      <section id="reviewer-access" className="panel mb-8 scroll-mt-6 space-y-3 p-5" aria-labelledby="reviewer-title">
        <h2 id="reviewer-title" className="section-title">Reviewer access</h2>
        {typeof database === "string" ? <p className="detail-copy">This PostgreSQL case is available for inspection. Server review and updates require MongoDB case storage.</p>
          : reviewer ? <form action={signOutSandboxReviewer} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="case" value={id} />
            <p className="detail-copy">Signed in as <strong>{reviewer}</strong>.</p>
            <ActionButton className="button button-secondary" busy="Signing out…">Sign out reviewer</ActionButton>
          </form> : reviewersConfigured() ? <form action={signInSandboxReviewer} className="max-w-lg space-y-3">
            <input type="hidden" name="case" value={id} />
            <p className="detail-copy">Use your individual reviewer credentials to save decisions or change evidence.</p>
            {query.review === "signin-failed" && <p role="alert" className="feedback feedback-error">The reviewer ID or token did not match.</p>}
            {query.review === "signin" && <p role="alert" className="feedback feedback-error">Sign in as a reviewer to continue.</p>}
            <label className="grid gap-1 text-sm font-semibold">Reviewer ID
              <input name="reviewer" className="field" autoComplete="username" required maxLength={64} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Reviewer token
              <input name="reviewerToken" className="field" type="password" autoComplete="current-password" required maxLength={64} />
            </label>
            <ActionButton className="button button-primary" busy="Signing in…">Sign in as reviewer</ActionButton>
          </form> : <p className="detail-copy">Ask the workspace administrator to provision an individual reviewer token.</p>}
      </section>
      {trusted && reviewer && (
        <details id="case-edit" className="panel mb-8 scroll-mt-6 p-5" open={Boolean(query.problem || query.review === "revised" || query.review === "unchanged")}>
          <summary className="section-title cursor-pointer">Update case evidence</summary>
          <div className="mt-3 space-y-4">
            {typeof query.problem === "string" && <p role="alert" className="feedback feedback-error">{query.problem.slice(0, 240)}</p>}
            {query.review === "revised" && <p role="status" className="feedback">Evidence updated. Previous approvals remain in history. Review the current statements again.
              {latestRevision?.changedRequests.length ? ` Changed requests: ${latestRevision.changedRequests.join(", ")}.` : ""}</p>}
            {query.review === "unchanged" && <p role="status" className="feedback">The evidence is already current.</p>}
            <form action={updateSandboxCase} className="space-y-4">
              {caseFields}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Withdraw supporting documents</legend>
                <p className="detail-copy">Select the old file and upload the corrected file below to replace it.</p>
                {trusted.row.sources.filter((source) => source.source_origin === "merchant_provided" && source.source_id !== notice.source_id)
                  .map((source) => <label className="flex items-start gap-2 text-sm" key={source.source_id}>
                    <input type="checkbox" name="withdraw" value={source.source_id} /> <span className="break-all">{source.source_name}</span>
                  </label>)}
              </fieldset>
              <label className="grid gap-1 text-sm font-semibold">Add supporting text files
                <input type="file" name="documents" multiple accept=".txt,text/plain" className="field" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">Replace notice text file
                <input type="file" name="replacementNotice" accept=".txt,text/plain" className="field" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">Verify payer from a linked PayPal Sandbox order
                <input name="linkedOrder" maxLength={36} className="field" />
              </label>
              <p className="detail-copy">The linked order must confirm the original capture and amount. Earlier evidence and review decisions stay in the case history.</p>
              <ActionButton className="button button-primary" busy="Updating…">Save evidence changes</ActionButton>
            </form>
            <form action={archiveSandboxCase} className="space-y-2 border-t border-rule pt-4">
              {caseFields}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirmArchive" value="yes" required /> Remove this case from the workspace and retain its audit records
              </label>
              <ActionButton className="button button-secondary" busy="Removing…">Remove case</ActionButton>
            </form>
          </div>
        </details>
      )}
      {trusted && (trusted.history.length > 0 || latestRevision || packets?.length) && (
        <details className="panel mb-8 space-y-3 p-5" id="case-history">
          <summary className="section-title cursor-pointer">Case and review history</summary>
          <p className="detail-copy">Current evidence version <code className="break-all">{review.version}</code></p>
          {packets?.map((packet) => <div className="space-y-1 border-t border-rule pt-3" key={packet.serial}>
            <a href={`/sandbox/cases/${id}/packet/${packet.serial}`} className="text-link text-sm">
              Download {packet.serial === serial ? "current" : "historical"} packet · <time>{packet.exportedAt.toISOString()}</time>
            </a>
            <p className="detail-copy">Evidence version <code className="break-all">{packet.version}</code></p>
          </div>)}
          {[...(trusted.row.revisions ?? [])].reverse().map((revision) => (
            <section key={revision.evidenceVersion} className="space-y-2 border-t border-rule pt-3">
              <p className="text-sm font-semibold">Evidence revised by {revision.reviewer} · <time>{revision.at.toISOString()}</time></p>
              <p className="detail-copy">Previous version <code className="break-all">{revision.evidenceVersion}</code></p>
              <p className="detail-copy">Changed requests: {revision.changedRequests.join(", ") || "No change to request findings"}</p>
              <p className="detail-copy break-all">Retained snapshots: {revision.sources.map(({ source_name }) => source_name).join(", ")}</p>
            </section>
          ))}
          {[...trusted.history].reverse().map((event) => (
            <section key={event.id} className="space-y-2 border-t border-rule pt-3">
              <p className="text-sm font-semibold">{event.decision === "pending" ? "Cleared" : event.decision === "accepted" ? "Accepted" : "Rejected"} by {event.reviewer} · <time>{event.at.toISOString()}</time></p>
              <p className="detail-copy">{event.claim.statement}</p>
              <p className="detail-copy">{event.evidenceVersion === review.version ? "Current evidence" : "Earlier evidence"} · <code className="break-all">{event.evidenceVersion}</code></p>
              <CitationInspector citations={event.claim.citations} group={event.id} />
            </section>
          ))}
        </details>
      )}
      <EvidenceGapAnalysis key={review.version} providerName={aiConfig ? evidenceProviderName(aiConfig.provider) : null} sandbox
        analyze={analyzeSandboxEvidence.bind(null, id, review.version)} />
      <ReviewWorkspace review={review} requests={notice.requests} decisions={trusted?.decisions ?? {}} feedback={query.review}
        sandbox={{ caseId: id, save: saveSandboxDecision, serial, canDecide: Boolean(trusted && reviewer),
          editable: Boolean(trusted && reviewer), currentEvents: trusted?.currentEvents }} />
    </main>
  );
}
