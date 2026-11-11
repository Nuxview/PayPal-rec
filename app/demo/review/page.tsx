import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { loadAgencyFixture } from "../../../lib/evidence/agency-fixture";
import { invoiceRecord, scopeRecord } from "../../../lib/evidence/match-records";
import { parseRestrictionNotice } from "../../../lib/evidence/notice";
import { buildReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import { agencyReviewCookie, readReviewDecisions } from "../../../lib/evidence/review-state";
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
    <main className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
      <nav aria-label="Demo navigation" className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-5">
        <Link href="/" className="font-semibold tracking-tight text-sky-300">PayPal Rec</Link>
        <Link href="/demo/payment" className="text-sm text-slate-300 underline decoration-slate-600 underline-offset-4 hover:text-slate-50">
          View case payment
        </Link>
      </nav>
      <header className="py-10 sm:py-12">
        <p className="inline-block rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
          Synthetic demo
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Review the evidence</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Prepare a draft response to a simulated PayPal account limitation. All people, businesses and records in this demo are fictional.
        </p>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="text-slate-400">Capture</dt><dd className="font-mono text-sky-200">{review.captureId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Amount</dt><dd className="font-semibold tabular-nums">{review.amount}</dd>
          </div>
        </dl>
        <section id="case-context" aria-labelledby="case-context-title" className="mt-7 scroll-mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 id="case-context-title" className="text-xl font-semibold">Start here: your role and the case</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            You are reviewing records on behalf of <strong className="text-slate-100">{payee.name}</strong>, the design agency.
            Your job is to check what its records support, decide which statements belong in its draft response, and identify anything that still needs explanation or evidence.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">What happened before this review?</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                The agency agreed to provide design work for {scope.client} on project {scope.project}.
                The supplied records include {invoices.length} invoices and a PayPal payment of {review.amount}.
                The simulated notice now asks the agency to explain the payment and provide supporting records.
              </p>
              <p className="mt-2 text-sm text-slate-300">Payer named on the payment: <span className="text-slate-100">{payer.name}</span>.</p>
            </div>
            <div>
              <h3 className="font-semibold">Work agreed with the client</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {scope.items.map(({ id, title }) => <li key={id}>{id} · {title}</li>)}
              </ul>
              <p className="mt-2 text-sm text-slate-400">These are expected deliverables. Use the records below to check what was received.</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">Background sources: {scope.projectCitation.source_id} · statement of work; {noticeSource.source_id} · simulated notice. Nothing is submitted to PayPal.</p>
        </section>
      </header>
      <ReviewWorkspace review={review} requests={notice.requests} decisions={decisions} feedback={query.review} />
    </main>
  );
}
