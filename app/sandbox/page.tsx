import Link from "next/link";
import { reportSandboxStorageFailure } from "../../lib/evidence/sandbox-storage-errors";
import { sandboxConfig } from "../../lib/paypal/sandbox-access";
import { isTestOrderId } from "../../lib/paypal/test-checkout";
import { ActionButton } from "../action-button";
import { Icon, PageHeader } from "../ui";
import { authorizedSandbox, sandboxCaseStore } from "./access";
import { lockSandbox, unlockSandbox } from "./actions";
import { WorkspaceIntake } from "./workspace-intake";

export const metadata = { title: "Sandbox workspace | PayPal Rec" };

export default async function SandboxHome({ searchParams }: {
  searchParams: Promise<{ notice?: string; order?: string | string[] }>;
}) {
  const query = await searchParams;
  const order = isTestOrderId(query.order) ? query.order : "";
  const configured = sandboxConfig();
  const access = await authorizedSandbox();
  const cases = access ? await sandboxCaseStore(access.database).listCases()
    .then((items) => ({ items, error: null }))
    .catch((error: unknown) => ({ items: [], error: reportSandboxStorageFailure(access.database, "list", error) }))
    : { items: [], error: null };

  return (
    <main id="main" className="shell pb-16">
      <PageHeader label="Private · PayPal Sandbox" title="Test evidence workspace" action={access && (
        <form action={lockSandbox}><ActionButton className="button button-secondary" busy="Locking…">Lock workspace</ActionButton></form>
      )}>
        Create a test payment or use an existing capture, then review it against your case records.
      </PageHeader>
      {!configured ? (
        <section className="panel max-w-xl space-y-4 p-6" aria-labelledby="setup-title">
          <h2 className="section-title" id="setup-title">Sandbox setup required</h2>
          <p className="detail-copy">Ask the workspace administrator to connect a Sandbox seller and database and set a workspace key. You can rehearse the complete review and download with the synthetic case now.</p>
          <Link href="/demo/review" className="button button-primary">Review the demo case <Icon name="arrow" /></Link>
        </section>
      ) : !access ? (
        <form action={unlockSandbox} className="panel max-w-xl space-y-4 p-6">
          <h2 className="section-title">Unlock Sandbox</h2>
          <p className="detail-copy">Use the workspace key provided by your administrator. It’s separate from your PayPal password.</p>
          {order && <input type="hidden" name="resume" value={order} />}
          <label className="grid gap-2 text-sm font-semibold">Workspace key
            <input name="key" type="password" required maxLength={512} autoComplete="current-password" className="field" />
          </label>
          {query.notice === "key" && <p role="alert" className="feedback feedback-error">That workspace key did not match. Check it and try again.</p>}
          <ActionButton className="button button-primary" busy="Unlocking…">Unlock workspace</ActionButton>
        </form>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {query.notice === "archived" && <p role="status" className="feedback lg:col-span-2">Case removed from the workspace. Audit records are retained.</p>}
          <WorkspaceIntake resumedOrder={order} />
          <aside className="panel space-y-4 p-5" aria-labelledby="recent-title">
            <h2 id="recent-title" className="section-title">Recent cases</h2>
            {cases.error ? <p role="status" className="feedback feedback-warn">{cases.error}</p> :
              cases.items.length ? <ul className="divide-y divide-rule">{cases.items.map(({ id, label }) => (
                <li key={id}><Link href={`/sandbox/cases/${id}`} className="text-link inline-flex min-h-11 items-center gap-2 break-all text-sm">{label} <Icon name="arrow" /></Link></li>
              ))}</ul> : <p className="detail-copy">Cases you create will appear here.</p>}
            <p className="detail-copy border-t border-rule pt-4">Sandbox funds and test documents only. Nothing is submitted to PayPal.</p>
          </aside>
        </div>
      )}
    </main>
  );
}
