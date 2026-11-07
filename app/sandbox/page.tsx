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
        <p className="mt-6 rounded-xl border border-slate-700 p-4 text-sm text-slate-300">
          This workspace is not configured. Follow <code>docs/paypal-sandbox-workspace.md</code> in the repository to set the Sandbox credentials, workspace key and database.
        </p>
      ) : !access ? (
        <form action={unlockSandbox} className="mt-7 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <label className="block text-sm font-medium">Workspace key
            <input name="key" type="password" required autoComplete="current-password" className={input} />
          </label>
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
              <span className="mt-1 block text-xs text-slate-400">Include invoices, the statement of work and any client receipts.</span>
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
          </form>
        </>
      )}
    </main>
  );
}
