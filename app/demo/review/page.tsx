import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { publicGeminiEnabled } from "../../../lib/ai/gemini-evidence";
import { loadAgencyFixture } from "../../../lib/evidence/agency-fixture";
import { invoiceRecord, scopeRecord } from "../../../lib/evidence/match-records";
import { parseRestrictionNotice } from "../../../lib/evidence/notice";
import { buildReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import { agencyReviewCookie, readReviewDecisions } from "../../../lib/evidence/review-state";
import { Icon, PageHeader } from "../../ui";
import { analyzeDemoEvidence } from "./analyze";
import { EvidenceGapAnalysis } from "./gap-analysis";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review evidence | PayPal Rec" };

export default async function DemoReview({ searchParams }: { searchParams: Promise<{ review?: string | string[] }> }) {
  const fixture = await loadAgencyFixture();
  const review = buildReviewSnapshot(fixture);
  const noticeSource = fixture.sources.find(({ source_id }) => source_id === fixture.report.notice_source_id);
  const scopes = fixture.sources.map(scopeRecord).filter((scope) => scope !== undefined);
  const { payer, payee } = fixture.payment;
  if (!noticeSource || scopes.length !== 1 || !payer || !payee) {
    throw new Error("The demo introduction requires a notice, one statement of work and named payment parties.");
  }
  const scope = scopes[0];
  const invoices = fixture.sources.map(invoiceRecord).filter((invoice) => invoice?.project === scope.project);
  const notice = parseRestrictionNotice(noticeSource.source_id, noticeSource.source_content);
  const [jar, query] = await Promise.all([cookies(), searchParams]);
  const decisions = readReviewDecisions(jar.get(agencyReviewCookie)?.value ?? null, review);
  return (
    <main id="main" className="shell pb-16">
      <PageHeader label="Synthetic demo · Agency case" title="Review the evidence" action={
        <Link href="/demo/payment" className="button button-secondary"><Icon name="wallet" /> View case payment</Link>
      }>
        Prepare a draft response to a simulated PayPal account limitation. This case uses fictional records.
      </PageHeader>
      <section id="case-context" aria-labelledby="case-context-title" className="panel mb-8 scroll-mt-6 p-5 sm:p-6">
        <h2 id="case-context-title" className="section-title">Start here: your role and the case</h2>
        <p className="detail-copy mt-3">
          You are reviewing records on behalf of <strong className="text-ink">{payee.name}</strong>, the design agency.
          Your job is to check what its records support, decide which statements belong in its draft response, and identify anything that still needs explanation or evidence.
        </p>
        <div className="mt-5 grid gap-5 border-t border-rule pt-5 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">What happened before this review?</h3>
            <p className="detail-copy mt-2">
              The agency agreed to provide design work for {scope.client} on project {scope.project}.
              The supplied records include {invoices.length} invoices and a PayPal payment of {review.amount}.
              The simulated notice now asks the agency to explain the payment and provide supporting records.
            </p>
            <p className="detail-copy mt-2">Payer: <strong className="text-ink">{payer.name}</strong> · {review.amount}.</p>
          </div>
          <div>
            <h3 className="font-semibold">Work agreed with the client</h3>
            <ul className="detail-copy mt-2 space-y-1">
              {scope.items.map(({ id, title }) => <li key={id}>{id} · {title}</li>)}
            </ul>
            <p className="detail-copy mt-2">These are expected deliverables. Use the records below to check what was received.</p>
          </div>
        </div>
        <p className="detail-copy mt-4">Background sources: {scope.projectCitation.source_id} · statement of work; {noticeSource.source_id} · simulated notice. Nothing is submitted to PayPal.</p>
      </section>
      <EvidenceGapAnalysis key={review.version} enabled={publicGeminiEnabled()}
        analyze={analyzeDemoEvidence.bind(null, review.version)} />
      <ReviewWorkspace review={review} requests={notice.requests} decisions={decisions} feedback={query.review} />
    </main>
  );
}
