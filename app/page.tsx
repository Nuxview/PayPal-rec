import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center px-6 py-16 sm:px-10">
      <p className="text-sm font-semibold tracking-wide text-sky-300">PayPal Rec</p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Account limitation evidence workspace
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
        Connect a PayPal payment to the invoices and delivery records that support it.
        See what is missing before preparing a response.
      </p>
      <p className="mt-8 border-l-2 border-sky-400 pl-4 text-sm text-slate-300">
        Try the synthetic case or import a test capture in the private Sandbox workspace.
        {" "}Review a draft here, then submit the requested records through PayPal. This app does not send evidence or remove account limitations.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href="/demo/review" className="rounded-md bg-sky-300 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-200">
          Review the demo case
        </Link>
        <Link href="/demo/payment" className="font-semibold text-sky-300 underline">
          View the demo payment
        </Link>
        <Link href="/sandbox" className="font-semibold text-sky-300 underline">
          Open Sandbox workspace
        </Link>
      </div>
    </main>
  );
}
