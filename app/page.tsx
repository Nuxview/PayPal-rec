import Link from "next/link";
import { Icon } from "./ui";

const stages = [
  { icon: "wallet", title: "Connect the payment", description: "Start with the capture named in the limitation notice." },
  { icon: "search", title: "Review the evidence", description: "Read original excerpts and see which requests still have gaps." },
  { icon: "download", title: "Download a draft", description: "Take the reviewed claims and follow-ups with you in a PDF and JSON." },
] as const;

export default function Home() {
  return (
    <main id="main" className="shell pb-12 pt-6 sm:pt-10">
      <section className="grid overflow-hidden rounded-xl bg-ink text-white lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6 p-6 sm:p-12 lg:p-16">
          <p className="eyebrow text-[#c3dbc6]">Account limitation evidence</p>
          <h1 className="page-title max-w-lg">Build a response you can back up.</h1>
          <p className="max-w-md text-base leading-relaxed text-[#d8e7dc]">Trace a PayPal payment to the invoices and delivery records behind it. See which claims you can support and what you still need to find.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo/review" className="button bg-white text-ink hover:bg-leaf">Review the demo case <Icon name="arrow" /></Link>
            <Link href="/sandbox" className="button border border-[#76988a] text-white hover:bg-white/10">Open Sandbox</Link>
          </div>
          <p className="text-sm text-[#c3dbc6]">The demo uses fictional records. Nothing is sent to PayPal.</p>
        </div>
        <aside aria-label="Sample case at a glance" className="flex items-center bg-[#dfeade] p-6 text-ink sm:p-10 lg:p-12">
          <div className="panel w-full p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">Agency case</p>
              <span className="badge badge-neutral">Synthetic demo</span>
            </div>
            <p className="mt-4 font-display text-4xl tracking-tight">USD 2,400.00</p>
            <ul className="mt-4 divide-y divide-rule text-sm">
              <li className="flex items-center justify-between gap-2 py-3"><span>Invoice allocation</span><span className="badge">Proposed</span></li>
              <li className="flex items-center justify-between gap-2 py-3"><span>Payer relationship</span><span className="badge badge-warn">Needs review</span></li>
              <li className="flex items-center justify-between gap-2 py-3"><span>Proof of delivery</span><span className="badge badge-warn">Evidence gap</span></li>
            </ul>
            <Link href="/demo/payment" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">View demo payment <Icon name="arrow" /></Link>
          </div>
        </aside>
      </section>
      <ol aria-label="How it works" className="mt-6 grid gap-3 md:grid-cols-3">
        {stages.map(({ icon, title, description }) => (
          <li key={title} className="panel flex items-start gap-4 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-leaf text-brand"><Icon name={icon} /></span>
            <div><h2 className="font-semibold">{title}</h2><p className="detail-copy mt-1">{description}</p></div>
          </li>
        ))}
      </ol>
    </main>
  );
}
