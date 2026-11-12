import Link from "next/link";

export const metadata = { title: "Sandbox checkout return | PayPal Rec" };

export default async function CheckoutReturn({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; cancelled?: string | string[] }>;
}) {
  const query = await searchParams;
  const orderId = typeof query.token === "string" && /^[A-Z0-9]{1,36}$/i.test(query.token) ? query.token : null;
  const cancelled = query.cancelled === "1";
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
      <p className="text-sm font-semibold text-sky-300">PAYPAL SANDBOX</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Back from test checkout</h1>
      <p className="mt-4 leading-relaxed text-slate-300">
        Approval and capture are separate steps. This page does not capture the order or verify its approval status.
      </p>
      {cancelled ? (
        <p className="mt-5 rounded-lg border border-amber-300/30 p-4 text-sm text-amber-100">
          You returned through the cancellation link. Approve a test order as a Sandbox buyer before running the capture command.
        </p>
      ) : (
        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5" aria-labelledby="capture-title">
          <h2 id="capture-title" className="text-xl font-semibold">1. Get the capture ID</h2>
          {orderId ? (
            <>
              <p className="mt-3 text-sm text-slate-300">Order ID from the return URL: <code className="break-all text-slate-100">{orderId}</code></p>
              <p className="mt-3 text-sm text-slate-300">If you approved this order, run this command from the project directory:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm text-sky-100"><code>{`npm run paypal:checkout -- capture ${orderId}`}</code></pre>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-300">No valid order ID was found in this URL. Use the <code>order_id</code> printed by <code>npm run paypal:checkout -- create</code>:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm text-sky-100"><code>npm run paypal:checkout -- capture YOUR_ORDER_ID</code></pre>
            </>
          )}
          <p className="mt-3 text-sm text-slate-300">The command checks approval before capturing. Copy <code>capture_id</code> from its successful output. The order ID and <code>PayerID</code> are not the capture ID.</p>
        </section>
      )}
      <section className="mt-6" aria-labelledby="workspace-title">
        <h2 id="workspace-title" className="text-xl font-semibold">{cancelled ? "Workspace setup" : "2. Prepare the review workspace"}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">The checkout commands only need Sandbox API credentials. Browser review also needs a running PostgreSQL database, both migrations, <code>DATABASE_URL</code> and a workspace key. Complete the setup guide before importing the capture.</p>
        <p className="mt-3 text-sm text-slate-300">To preview the capture without a database, run <code>npm run paypal:import -- --sandbox YOUR_CAPTURE_ID</code>.</p>
        <Link href="/sandbox" className="mt-4 inline-block text-sky-300 underline">Continue to workspace setup</Link>
      </section>
    </main>
  );
}
