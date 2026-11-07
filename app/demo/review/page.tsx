import type { Metadata } from "next";
import Link from "next/link";
import { loadAgencyFixture } from "../../../lib/evidence/agency-fixture";
import { buildReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review evidence | PayPal Rec" };

export default async function DemoReview() {
  const review = buildReviewSnapshot(await loadAgencyFixture());
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
          Inspect the citations behind each proposal for the agency case, then accept or reject it. Open issues stay visible for follow-up.
        </p>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="text-slate-400">Capture</dt><dd className="font-mono text-sky-200">{review.captureId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-400">Amount</dt><dd className="font-semibold tabular-nums">{review.amount}</dd>
          </div>
        </dl>
      </header>
      <ReviewWorkspace review={review} />
    </main>
  );
}
