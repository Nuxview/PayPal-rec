import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { caseUuid, loadSandboxReview } from "../../../../lib/evidence/sandbox-case";
import { readReviewDecisions } from "../../../../lib/evidence/review-state";
import { Icon, PageHeader } from "../../../ui";
import { ReviewWorkspace } from "../../../demo/review/review-workspace";
import { authorizedSandbox, sandboxReviewCookie, withSandboxDatabase } from "../../access";
import { saveSandboxDecision } from "../../actions";

export const metadata = { title: "Review Sandbox evidence | PayPal Rec" };

export default async function SandboxCase({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ review?: string | string[] }>;
}) {
  const access = await authorizedSandbox();
  if (!access) redirect("/sandbox");
  const { id } = await params;
  if (!caseUuid.test(id)) notFound();
  const data = await withSandboxDatabase(access.database, (client) => loadSandboxReview(client, id)).catch(() => null);
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
  const [jar, query] = await Promise.all([cookies(), searchParams]);
  const decisions = readReviewDecisions(jar.get(sandboxReviewCookie(id))?.value ?? null, review);

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
      <ReviewWorkspace review={review} requests={notice.requests} decisions={decisions} feedback={query.review}
        sandbox={{ caseId: id, save: saveSandboxDecision }} />
    </main>
  );
}
