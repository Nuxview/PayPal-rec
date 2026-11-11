import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { caseUuid, loadSandboxReview } from "../../../../lib/evidence/sandbox-case";
import { readReviewDecisions } from "../../../../lib/evidence/review-state";
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
      <main className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/sandbox" className="text-sky-300 underline">Back to Sandbox workspace</Link>
        <h1 className="mt-6 text-3xl font-semibold">Case unavailable</h1>
        <p className="mt-3 text-slate-300">The case could not be loaded. Check the database and its stored notice and capture.</p>
      </main>
    );
  }
  const { review, payment, notice } = data;
  const [jar, query] = await Promise.all([cookies(), searchParams]);
  const decisions = readReviewDecisions(jar.get(sandboxReviewCookie(id))?.value ?? null, review);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8">
      <Link href="/sandbox" className="text-sm font-semibold text-sky-300 underline">Sandbox workspace</Link>
      <header id="case-context" className="scroll-mt-6 py-8">
        <p className="inline-block rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-sky-200">
          PayPal Sandbox · Test capture
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Review Sandbox evidence</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          The capture came from PayPal Sandbox. Proposals use the notice and documents uploaded for this case.
        </p>
        <dl className="mt-5 grid gap-3 rounded-xl border border-slate-800 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-400">Capture</dt><dd className="break-all font-mono">{payment.transaction_id}</dd></div>
          <div><dt className="text-slate-400">Amount</dt><dd>{review.amount}</dd></div>
          <div><dt className="text-slate-400">Status</dt><dd>{payment.capture_status}</dd></div>
          <div><dt className="text-slate-400">Payer</dt><dd>{payment.payer?.name ?? "Not available"}</dd></div>
        </dl>
        {!review.proposals.length && (
          <p className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            No supported matches were found. Check that the notice names this capture and amount, and that the uploaded invoices and client correspondence link to the same project.
          </p>
        )}
        <details className="mt-4 rounded-lg border border-slate-800 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-sky-200">
            Notice requests ({notice.requests.length})
          </summary>
          {notice.requests.length ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {notice.requests.map(({ label, text, citation }) => (
                <li key={label}>{label}: {text} <span className="text-slate-400">· line {citation.start_line}</span></li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-300">No explicit requests could be read from the supplied notice.</p>}
        </details>
      </header>
      <ReviewWorkspace review={review} requests={notice.requests} decisions={decisions} feedback={query.review}
        sandbox={{ caseId: id, save: saveSandboxDecision }} />
    </main>
  );
}
