import Link from "next/link";

export const metadata = { title: "Sandbox checkout return | PayPal Rec" };

export default function CheckoutReturn() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
      <p className="text-sm font-semibold text-sky-300">PAYPAL SANDBOX</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Back from test checkout</h1>
      <p className="mt-4 leading-relaxed text-slate-300">
        If you approved the test order, return to your terminal and run the capture command with your order ID.
        The command checks its approval status before capturing. This page does not capture the order.
      </p>
      <Link href="/sandbox" className="mt-6 inline-block text-sky-300 underline">Open Sandbox workspace</Link>
    </main>
  );
}
