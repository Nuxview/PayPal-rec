import Link from "next/link";
import { isTestOrderId } from "../../../lib/paypal/test-checkout";
import { Icon, PageHeader } from "../../ui";

export const metadata = { title: "Sandbox checkout return | PayPal Rec" };

export default async function CheckoutReturn({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; cancelled?: string | string[] }>;
}) {
  const query = await searchParams;
  const order = isTestOrderId(query.token) ? query.token : null;
  const cancelled = query.cancelled === "1";
  return (
    <main id="main" className="shell pb-16">
      <PageHeader label="PayPal Sandbox" title={cancelled ? "Checkout cancelled" : "Back from test checkout"}>
        {cancelled ? "No capture was started by this return page." : "Return to the workspace to check buyer approval and capture the test payment."}
      </PageHeader>
      <section className="panel max-w-xl space-y-4 p-6">
        {cancelled ? <p className="detail-copy">Start another checkout in the workspace when you’re ready.</p> : order ? (
          <dl className="rounded-lg bg-leaf p-4 text-sm"><dt className="text-muted">Checkout order ID</dt><dd className="break-all font-mono">{order}</dd></dl>
        ) : <p role="status" className="feedback feedback-warn">No valid order ID came back from PayPal. You can enter a test order ID in the workspace.</p>}
        <Link href={order && !cancelled ? `/sandbox?order=${order}` : "/sandbox"} className="button button-primary">
          {order && !cancelled ? "Continue to capture" : "Back to Sandbox workspace"} <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
