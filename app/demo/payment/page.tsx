import Link from "next/link";
import { paymentLabels } from "../../../lib/paypal/payment";
import { loadReplayPayment } from "../../../lib/paypal/replay";

export default function DemoPayment() {
  const payment = loadReplayPayment();
  const fields = [
    ["Capture ID", payment.transaction_id],
    ["Capture status", payment.capture_status],
    ["Capture time", payment.captured_at],
    ["Payer", payment.payer?.name ?? "Not provided"],
    ["Payee", payment.payee?.name ?? "Not provided"],
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <Link className="text-sm font-semibold text-sky-300 underline" href="/">PayPal Rec</Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Agency case payment</h1>
      <p className="mt-4 inline-block rounded-full bg-amber-300/15 px-3 py-1 text-sm font-semibold text-amber-200">
        {paymentLabels[payment.source_mode]}
      </p>
      <p className="mt-4 text-slate-300">This record comes from the demo fixture. It was not retrieved from PayPal.</p>
      <section aria-label="Payment details" className="mt-8 rounded-xl border border-slate-700 p-6">
        <p className="text-3xl font-semibold tabular-nums">{payment.amount.currency} {payment.amount.value}</p>
        <dl className="mt-6 divide-y divide-slate-700">
          {fields.map(([label, value]) => (
            <div className="grid gap-1 py-3 sm:grid-cols-2" key={label}>
              <dt className="text-slate-400">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
