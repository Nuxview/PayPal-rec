"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { exceedsSandboxUploadLimits, maxDocumentBytes, sandboxUploadLimitMessage } from "../../lib/evidence/document-limits";
import { Icon } from "../ui";
import { createSandboxCase, finishSandboxCheckout, previewSandboxCapture, startSandboxCheckout } from "./actions";

type Order = { order_id: string; approval_url: string };
type Payment = { id: string; order: string; amount: string; status: string; payer: string | null };
type Step = "create" | "capture" | "lookup" | "import";
type PaymentMode = "new" | "existing";

const steps = ["Connect payment", "Add evidence", "Review & export"];

export function WorkspaceIntake({ resumedOrder }: { resumedOrder: string }) {
  const router = useRouter();
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const paymentHeading = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<PaymentMode>("new");
  const [order, setOrder] = useState<Order>();
  const [orderId, setOrderId] = useState(resumedOrder);
  const [payment, setPayment] = useState<Payment>();
  const [noticeMode, setNoticeMode] = useState<"upload" | "paste">("upload");
  const [editing, setEditing] = useState(true);
  const [working, setWorking] = useState<Step>();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const busy = pending || opening;

  function run(step: Step, action: () => Promise<void>) {
    setError("");
    setWorking(step);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("The request did not finish. Try again. If the workspace locked, refresh and unlock it first.");
      }
    });
  }

  function connect(result: Payment) {
    setPayment(result);
    setEditing(false);
    requestAnimationFrame(() => evidenceHeading.current?.focus());
  }

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const capture = String(data.get("capture") ?? "").trim();
    const order = String(data.get("order") ?? "").trim();
    run("lookup", async () => {
      const result = await previewSandboxCapture(capture, order);
      if (result.error) setError(result.error);
      else if (result.payment) connect({ ...result.payment, order });
    });
  }

  function importCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // An unselected file input contributes an unnamed placeholder. Omit it
    // before Next serializes the form so a notice-only case can be reviewed.
    const documents = data.getAll("documents");
    if (documents.length === 1 && documents[0] instanceof File && !documents[0].name) data.delete("documents");
    const sizes = [...data.values()].flatMap((value) => value instanceof File && value.name ? [value.size] : []);
    const noticeText = data.get("noticeText");
    if (typeof noticeText === "string") sizes.push(new TextEncoder().encode(noticeText).byteLength);
    if (exceedsSandboxUploadLimits(sizes)) {
      setWorking("import");
      setError(sandboxUploadLimitMessage);
      return;
    }
    run("import", async () => {
      const result = await createSandboxCase(data);
      if (result.error) setError(result.error);
      else if (result.id) {
        setOpening(true);
        router.push(`/sandbox/cases/${result.id}`);
      }
    });
  }

  const paymentError = error && working !== "import";
  return (
    <div className="space-y-6">
      <ol aria-label="Sandbox workflow" className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => {
          const current = index === (editing ? 0 : 1);
          return <li key={step} aria-current={current ? "step" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${current ? "bg-brand text-white" : "bg-leaf text-brand"}`}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current" aria-hidden="true">{index === 0 && !editing ? "✓" : index + 1}</span>{step}
          </li>;
        })}
      </ol>
      <section aria-labelledby="payment-title" className="panel space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payment-title" ref={paymentHeading} tabIndex={-1} className="section-title">Connect a test payment</h2>
          {!editing && <button className="button button-secondary" type="button" disabled={busy} onClick={() => {
            setError("");
            setEditing(true);
            requestAnimationFrame(() => paymentHeading.current?.focus());
          }}>Change payment</button>}
        </div>
        {editing ? (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Payment source">
              <button type="button" className={`button ${mode === "new" ? "button-primary" : "button-secondary"}`} aria-pressed={mode === "new"} disabled={busy}
                onClick={() => { setMode("new"); setError(""); }}>Sandbox checkout</button>
              <button type="button" className={`button ${mode === "existing" ? "button-primary" : "button-secondary"}`} aria-pressed={mode === "existing"} disabled={busy}
                onClick={() => { setMode("existing"); setError(""); }}>Existing capture</button>
            </div>
            {paymentError && <p role="alert" className="feedback feedback-error">{error}</p>}
            {mode === "existing" ? (
              <form onSubmit={lookup} className="space-y-4">
                <p className="detail-copy">Look up a completed capture from the Sandbox seller linked to this workspace.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">Sandbox capture ID
                    <input className="field" name="capture" required maxLength={50} defaultValue={payment?.id} />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">Checkout order ID (optional)
                    <input className="field" name="order" maxLength={36} defaultValue={payment?.order} aria-describedby="order-help" />
                  </label>
                </div>
                <p id="order-help" className="detail-copy">The linked order can supply the payer name. The capture and order have different IDs.</p>
                <button className="button button-primary" disabled={busy}>{pending && working === "lookup" ? "Looking up capture…" : "Look up capture"}</button>
              </form>
            ) : (
              <div className="space-y-4">
                {!orderId && !order && <>
                  <p className="detail-copy">Create a USD 10.00 test order, then approve it on PayPal using a separate Sandbox Personal buyer account.</p>
                  <button type="button" className="button button-primary" disabled={busy} onClick={() => run("create", async () => {
                    const result = await startSandboxCheckout();
                    if (result.error) setError(result.error);
                    else if (result.order) { setOrder(result.order); setOrderId(result.order.order_id); }
                  })}>{pending && working === "create" ? "Creating order…" : "Create USD 10.00 test order"}</button>
                </>}
                {order && (
                  <div className="feedback space-y-3">
                    <p role="status">Test order created. Approve it on PayPal Sandbox, then return here to capture it.</p>
                    <a href={order.approval_url} className="button button-primary" aria-describedby="sandbox-funds">Open PayPal Sandbox checkout <Icon name="arrow" /></a>
                    <p id="sandbox-funds">Uses Sandbox funds only. Order ID: <code className="break-all">{order.order_id}</code></p>
                  </div>
                )}
                <details open={order || resumedOrder ? true : undefined} className="rounded-lg bg-paper px-4">
                  <summary className="min-h-11 content-center py-2 text-sm font-semibold text-brand">Capture an approved test order</summary>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const id = orderId.trim();
                    run("capture", async () => {
                      const result = await finishSandboxCheckout(id);
                      if (result.error) setError(result.error);
                      else if (result.capture) {
                        const { capture_id, amount, status } = result.capture;
                        connect({ id: capture_id, order: id, amount: `${amount.currency} ${amount.value}`, status, payer: null });
                      }
                    });
                  }} className="space-y-3 pb-4">
                    <p className="detail-copy">Use the test order ID after buyer approval. If it was already captured, we’ll recover its capture ID.</p>
                    <label className="grid gap-2 text-sm font-semibold">Test order ID
                      <input className="field" required maxLength={36} value={orderId} onChange={(event) => setOrderId(event.target.value)} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="button button-primary" disabled={busy}>{pending && working === "capture" ? "Checking and capturing…" : "Capture approved order"}</button>
                      {orderId && <button type="button" className="button button-quiet" disabled={busy} onClick={() => {
                        setOrderId(""); setOrder(undefined); setError("");
                      }}>Use another order</button>}
                    </div>
                  </form>
                </details>
              </div>
            )}
          </>
        ) : payment && (
          <dl className="grid gap-3 rounded-lg bg-leaf p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Capture ID</dt><dd className="break-all font-mono">{payment.id}</dd></div>
            <div><dt className="text-muted">Sandbox amount</dt><dd className="font-semibold">{payment.amount} · {payment.status}</dd></div>
            {payment.payer && <div><dt className="text-muted">Payer</dt><dd>{payment.payer}</dd></div>}
          </dl>
        )}
      </section>
      {payment && (
        <section hidden={editing} aria-labelledby="evidence-title" className="panel space-y-4 p-5 sm:p-6">
          <h2 id="evidence-title" tabIndex={-1} ref={evidenceHeading} className="section-title">Add the case evidence</h2>
          <p className="detail-copy">Use a simulated notice and test documents. We’ll look for invoice allocation and delivery evidence, then show any gaps.</p>
          {working === "import" && error && <p role="alert" className="feedback feedback-error">{error}</p>}
          <form onSubmit={importCase} className="space-y-4">
            <input type="hidden" name="capture" value={payment.id} />
            <input type="hidden" name="order" value={payment.order} />
            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-semibold">Notice</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="noticeMode" checked={noticeMode === "upload"} onChange={() => setNoticeMode("upload")} className="size-4 accent-brand" /> Upload text file</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="noticeMode" checked={noticeMode === "paste"} onChange={() => setNoticeMode("paste")} className="size-4 accent-brand" /> Paste text</label>
              </div>
              <div hidden={noticeMode !== "upload"}>
                <input aria-label="Notice text file" className="field" name="notice" type="file" accept=".txt,text/plain"
                  disabled={noticeMode !== "upload"} required />
              </div>
              <div hidden={noticeMode !== "paste"}>
                <textarea aria-label="Notice text" className="field min-h-32" name="noticeText" disabled={noticeMode !== "paste"}
                  required maxLength={maxDocumentBytes} placeholder={`Payment under review: ${payment.id}, ${payment.amount}\nR1: Provide the invoices showing what this payment covered.`} />
              </div>
            </fieldset>
            <label className="grid gap-2 text-sm font-semibold">Supporting documents (.txt)
              <input className="field" name="documents" type="file" accept=".txt,text/plain" multiple disabled={busy} aria-describedby="file-limits" />
            </label>
            <p id="file-limits" className="detail-copy">Up to 25 UTF-8 text files including the notice; 256 KiB each, 768 KiB total. Add invoices, a statement of work and client receipts if you have them.</p>
            <details className="rounded-lg bg-paper px-4 text-sm">
              <summary className="min-h-11 content-center py-2 font-semibold text-brand">Supported text formats</summary>
              <div className="space-y-2 pb-4 text-muted">
                <p>Write the payment on a <code>Payment under review:</code> line and label requests <code>R1:</code>, <code>R2:</code> and so on.</p>
                <p>Use consistent project, invoice and deliverable IDs. Payment allocation must name the capture and invoices, with an exact total in the same currency.</p>
                <p>Provide explicit client acknowledgments for the deliverables. PDF, image and Word files are unsupported.</p>
              </div>
            </details>
            <button className="button button-primary" disabled={busy}>{busy && working === "import" ? "Building review…" : "Build evidence review"} <Icon name="arrow" /></button>
          </form>
        </section>
      )}
      <p role="status" className="sr-only">{busy ? "Request in progress" : payment && !editing ? "Payment connected. Add the case evidence next." : ""}</p>
    </div>
  );
}
