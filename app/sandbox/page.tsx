import Link from "next/link";
import { listSandboxCases } from "../../lib/evidence/sandbox-case";
import { sandboxConfig } from "../../lib/paypal/sandbox-access";
import { authorizedSandbox, withSandboxDatabase } from "./access";
import { createSandboxCase, lockSandbox, unlockSandbox } from "./actions";

export const metadata = { title: "Sandbox workspace | PayPal Rec" };
const input = "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
const submit = "rounded-lg bg-sky-300 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-200";

export default async function SandboxHome({ searchParams }: {
  searchParams: Promise<{ notice?: string; problem?: string }>;
}) {
  const query = await searchParams;
  const configured = sandboxConfig();
  const access = await authorizedSandbox();
  const cases = access ? await withSandboxDatabase(access.database, listSandboxCases).catch(() => null) : [];

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm font-semibold text-sky-300 underline">PayPal Rec</Link>
      <p className="mt-6 text-sm font-semibold text-sky-300">PAYPAL SANDBOX</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Sandbox workspace</h1>
      <p className="mt-3 text-slate-300">
        Retrieve an existing test capture and review it against the case documents you provide.
      </p>
      {!configured ? (
        <div className="mt-6 space-y-3 rounded-xl border border-slate-700 p-4 text-sm text-slate-300">
          <p>This workspace needs Sandbox API credentials, a workspace key of at least 24 characters, and <code>DATABASE_URL</code>. Start PostgreSQL and apply both migrations before importing a case. Follow <code>docs/paypal-sandbox-workspace.md</code> in order.</p>
          <p>Creating and capturing a test order only needs the Sandbox API credentials. You can preview a completed capture without a database using <code>npm run paypal:import -- --sandbox YOUR_CAPTURE_ID</code>.</p>
        </div>
      ) : !access ? (
        <form action={unlockSandbox} className="mt-7 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <label className="block text-sm font-medium">Workspace key
            <input name="key" type="password" required autoComplete="current-password" className={input} />
          </label>
          <p className="text-sm leading-relaxed text-slate-300">Enter the value configured as <code>PAYPAL_SANDBOX_WEB_KEY</code> on the server. It unlocks shared access to all Sandbox cases in this browser for eight hours. It is separate from your PayPal credentials and does not identify a reviewer.</p>
          {query.notice === "key" && <p role="alert" className="text-sm text-rose-200">That workspace key did not match.</p>}
          <button className={submit}>Unlock workspace</button>
        </form>
      ) : (
        <>
          <form action={createSandboxCase} className="mt-7 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-semibold">Import a case</h2>
            {typeof query.problem === "string" && <p role="alert" className="text-sm text-rose-200">{query.problem.slice(0, 240)}</p>}
            {cases === null && <p role="alert" className="text-sm text-rose-200">The database is unavailable. Check the connection and migrations.</p>}
            <label className="block text-sm font-medium">Sandbox capture ID
              <input name="capture" required maxLength={50} className={input} />
            </label>
            <label className="block text-sm font-medium">Checkout order ID (optional)
              <input name="order" maxLength={36} className={input} />
              <span className="mt-1 block text-xs text-slate-400">Use the linked order to look up the payer name.</span>
            </label>
            <label className="block text-sm font-medium">Notice (.txt)
              <input name="notice" type="file" accept=".txt,text/plain" required className={input} />
            </label>
            <label className="block text-sm font-medium">Supporting documents (.txt)
              <input name="documents" type="file" accept=".txt,text/plain" multiple className={input} />
              <span className="mt-1 block text-xs text-slate-400">Use UTF-8 text in the documented invoice, statement-of-work and client-receipt formats. PDF, image and Word conversion is not available. Up to 25 files including the notice, 256 KiB each and 768 KiB combined.</span>
            </label>
            <button className={submit}>Import Sandbox capture and review</button>
          </form>
          {cases && cases.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Recent Sandbox cases</h2>
              <ul className="mt-3 space-y-2">
                {cases.map(({ id, label }) => (
                  <li key={id}><Link href={`/sandbox/cases/${id}`} className="text-sky-300 underline">{label}</Link></li>
                ))}
              </ul>
            </section>
          )}
          <form action={lockSandbox} className="mt-8">
            <button className="text-sm font-semibold text-slate-300 underline">Lock workspace</button>
            <p className="mt-2 text-xs text-slate-400">Locking ends this browser’s workspace access. Stored cases and documents are kept.</p>
          </form>
        </>
      )}
    </main>
  );
}
