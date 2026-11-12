import Link from "next/link";
import { paymentLabels } from "../../../lib/paypal/payment";
import { loadReplayPayment } from "../../../lib/paypal/replay";
import { Icon, PageHeader } from "../../ui";

export default function DemoPayment() {
  const payment = loadReplayPayment();
  const fields = [
    ["Capture ID", payment.transaction_id],
    ["Capture status", payment.capture_status],
    ["Capture time (UTC)", payment.captured_at],
    ["Payer", payment.payer?.name ?? "Not provided"],
    ["Payee", payment.payee?.name ?? "Not provided"],
  ];
  return (
    <main id="main" className="shell pb-16">
      <PageHeader label="Synthetic demo · Agency case" title="Agency case payment" action={
        <Link href="/demo/review" className="button button-primary">Review the evidence <Icon name="arrow" /></Link>
      }>
        This payment comes from the fictional agency case. It was not retrieved from PayPal.
      </PageHeader>
      <section aria-label="Payment details" className="panel max-w-3xl overflow-hidden">
        <div className="space-y-3 bg-leaf p-5 sm:p-6">
          <p className="badge bg-white">{paymentLabels[payment.source_mode]}</p>
          <p className="font-display text-4xl tracking-tight">{payment.amount.currency} {payment.amount.value}</p>
        </div>
        <dl className="divide-y divide-rule px-5 py-2 text-sm sm:px-6">
          {fields.map(([label, value]) => (
            <div className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]" key={label}>
              <dt className="text-muted">{label}</dt><dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
