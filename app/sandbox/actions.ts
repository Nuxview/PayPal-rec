"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { exceedsSandboxUploadLimits, sandboxUploadLimitMessage } from "../../lib/evidence/document-limits";
import { DocumentIngestError, merchantDocument } from "../../lib/evidence/documents";
import { EvidenceMatchError } from "../../lib/evidence/match-store";
import { caseUuid, importSandboxCase, loadSandboxReview } from "../../lib/evidence/sandbox-case";
import { writeReviewDecision } from "../../lib/evidence/review-state";
import { loadSandboxPayment } from "../../lib/paypal/sandbox";
import { captureTestOrder, checkoutReturnPage, createTestOrder, isTestOrderId } from "../../lib/paypal/test-checkout";
import { PaymentImportError } from "../../lib/paypal/payment";
import { openSandboxSession, sandboxConfig, sandboxSessionCookie, sandboxSessionSeconds } from "../../lib/paypal/sandbox-access";
import { authorizedSandbox, sandboxReviewCookie, withSandboxDatabase } from "./access";

async function secureCookie() {
  return (await headers()).get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function unlockSandbox(data: FormData) {
  const config = sandboxConfig();
  if (!config) redirect("/sandbox");
  const supplied = data.get("key");
  const token = typeof supplied === "string" && supplied.length <= 512
    ? openSandboxSession(config.key, supplied.trim()) : null;
  const order = data.get("resume");
  const query = new URLSearchParams(isTestOrderId(order) ? { order } : {});
  if (!token) {
    query.set("notice", "key");
    redirect(`/sandbox?${query}`);
  }
  (await cookies()).set(sandboxSessionCookie, token, {
    httpOnly: true, sameSite: "strict", secure: await secureCookie(),
    path: "/sandbox", maxAge: sandboxSessionSeconds,
  });
  redirect(query.size ? `/sandbox?${query}` : "/sandbox");
}

export async function lockSandbox() {
  (await cookies()).set(sandboxSessionCookie, "", { path: "/sandbox", maxAge: 0, httpOnly: true, sameSite: "strict" });
  redirect("/sandbox");
}

async function readUpload(entry: File) {
  return merchantDocument(entry.name, new Uint8Array(await entry.arrayBuffer()));
}

const expired = "The workspace is locked or your session expired. Unlock it and try again.";

function paymentError(error: unknown) {
  return error instanceof PaymentImportError ? error.message : "PayPal Sandbox could not be reached. Try again.";
}

export async function startSandboxCheckout() {
  const config = await authorizedSandbox();
  if (!config) return { error: expired };
  const returnPage = checkoutReturnPage(process.env.PAYPAL_SANDBOX_RETURN_ORIGIN?.trim(), (await headers()).get("host"));
  if (!returnPage) return { error: "The app needs a valid public HTTPS return address to start checkout. Ask the workspace administrator, or use an existing capture." };
  try {
    return { order: await createTestOrder(config, fetch, returnPage) };
  } catch (error) {
    return { error: paymentError(error) };
  }
}

export async function finishSandboxCheckout(orderId: string) {
  const config = await authorizedSandbox();
  if (!config) return { error: expired };
  try {
    return { capture: await captureTestOrder(orderId, config) };
  } catch (error) {
    return { error: paymentError(error) };
  }
}

export async function previewSandboxCapture(captureId: string, orderId: string) {
  const config = await authorizedSandbox();
  if (!config) return { error: expired };
  try {
    const payment = await loadSandboxPayment(captureId, { ...config, orderId: orderId || undefined });
    return { payment: {
      id: payment.transaction_id, amount: `${payment.amount.currency} ${payment.amount.value}`,
      status: payment.capture_status, payer: payment.payer?.name ?? null,
    } };
  } catch (error) {
    return { error: paymentError(error) };
  }
}

export async function createSandboxCase(data: FormData) {
  const config = await authorizedSandbox();
  if (!config) return { error: expired };
  const capture = data.get("capture");
  const order = data.get("order");
  const notice = data.get("notice");
  const pasted = data.get("noticeText");
  const files = data.getAll("documents").filter((item): item is File => typeof item !== "string" && Boolean(item.name));
  try {
    if (typeof capture !== "string" || !capture.trim()) throw new PaymentImportError("Enter a Sandbox capture ID.");
    const noticeBytes = typeof pasted === "string" && pasted.trim() ? new TextEncoder().encode(pasted) : null;
    const noticeFile = notice && typeof notice !== "string" && notice.name ? notice : null;
    const selected = noticeFile ?? noticeBytes;
    if (!selected || (noticeFile && noticeBytes)) {
      throw new DocumentIngestError("Upload one notice file or paste the notice text.");
    }
    const noticeSize = selected instanceof Uint8Array ? selected.byteLength : selected.size;
    if (exceedsSandboxUploadLimits([noticeSize, ...files.map(({ size }) => size)])) {
      throw new DocumentIngestError(sandboxUploadLimitMessage);
    }
    const noticeDoc = selected instanceof Uint8Array ? merchantDocument("pasted-notice.txt", selected) : await readUpload(selected);
    const documents = await Promise.all(files.map(readUpload));
    const id = await withSandboxDatabase(config.database, (client) => importSandboxCase(client, {
      captureId: capture.trim(),
      orderId: typeof order === "string" ? order.trim() || undefined : undefined,
      notice: noticeDoc,
      documents,
    }, config));
    return { id };
  } catch (error) {
    return { error: error instanceof PaymentImportError || error instanceof DocumentIngestError || error instanceof EvidenceMatchError
      ? error.message
      : "Could not save the case. Check the database connection and migrations, then try again." };
  }
}

export async function saveSandboxDecision(data: FormData) {
  const config = await authorizedSandbox();
  const id = data.get("case");
  if (!config || typeof id !== "string" || !caseUuid.test(id)) redirect("/sandbox");
  const path = `/sandbox/cases/${id}`;
  const proposal = data.get("proposal");
  const decision = data.get("decision");
  if (typeof proposal !== "string" || (decision !== "accepted" && decision !== "rejected" && decision !== "pending")) redirect(`${path}?review=invalid`);
  const loaded = await withSandboxDatabase(config.database, (client) => loadSandboxReview(client, id)).catch(() => null);
  if (!loaded || data.get("version") !== loaded.review.version) redirect(`${path}?review=changed`);
  const jar = await cookies();
  const name = sandboxReviewCookie(id);
  const target = loaded.review.proposals.find((item) => item.id === proposal);
  const saved = writeReviewDecision(jar.get(name)?.value ?? null, loaded.review, proposal, decision);
  if (!saved || !target) redirect(`${path}?review=invalid`);
  jar.set(name, saved, { httpOnly: true, sameSite: "strict", secure: await secureCookie(), path, maxAge: sandboxSessionSeconds });
  redirect(`${path}?review=${decision === "pending" ? "undone" : "saved"}#request-${target.request}`);
}
