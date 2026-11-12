"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { exceedsSandboxUploadLimits, sandboxUploadLimitMessage } from "../../lib/evidence/document-limits";
import { DocumentIngestError, isSelectedUpload, merchantDocument } from "../../lib/evidence/documents";
import { EvidenceMatchError } from "../../lib/evidence/match-store";
import { archiveMongoSandboxCase, mongoSandboxCases, SandboxCaseConflict, saveMongoSandboxDecision, updateMongoSandboxEvidence } from "../../lib/evidence/mongo-sandbox-case";
import { caseUuid } from "../../lib/evidence/sandbox-case";
import { loadSandboxPayment } from "../../lib/paypal/sandbox";
import { captureTestOrder, checkoutReturnPage, createTestOrder, isTestOrderId } from "../../lib/paypal/test-checkout";
import { PaymentImportError } from "../../lib/paypal/payment";
import { openSandboxSession, sandboxConfig, sandboxSessionCookie, sandboxSessionSeconds } from "../../lib/paypal/sandbox-access";
import { openReviewerSession, reviewerCookie } from "../../lib/paypal/reviewer-access";
import { authorizedSandbox, sandboxCaseStore, sandboxReviewer } from "./access";

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
  const jar = await cookies();
  for (const name of [sandboxSessionCookie, reviewerCookie]) {
    jar.set(name, "", { path: "/sandbox", maxAge: 0, httpOnly: true, sameSite: "strict" });
  }
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
  const host = (await headers()).get("host");
  const deployment = process.env.VERCEL_URL;
  const origin = process.env.PAYPAL_SANDBOX_RETURN_ORIGIN?.trim() || (deployment && host === deployment ? `https://${deployment}` : undefined);
  const returnPage = checkoutReturnPage(origin, host);
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
  const files = data.getAll("documents").filter(isSelectedUpload);
  try {
    if (typeof capture !== "string" || !capture.trim()) throw new PaymentImportError("Enter a Sandbox capture ID.");
    const noticeBytes = typeof pasted === "string" && pasted.trim() ? new TextEncoder().encode(pasted) : null;
    const noticeFile = isSelectedUpload(notice) ? notice : null;
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
    const id = await sandboxCaseStore(config.database).importCase({
      captureId: capture.trim(),
      orderId: typeof order === "string" ? order.trim() || undefined : undefined,
      notice: noticeDoc,
      documents,
    }, config);
    return { id };
  } catch (error) {
    return { error: error instanceof PaymentImportError || error instanceof DocumentIngestError || error instanceof EvidenceMatchError
      ? error.message
      : "Could not save the case. Check the workspace database configuration, then try again." };
  }
}

async function sandboxMutation(data: FormData) {
  const config = await authorizedSandbox();
  const id = data.get("case");
  if (!config || typeof id !== "string" || !caseUuid.test(id)) redirect("/sandbox");
  const path = `/sandbox/cases/${id}`;
  const reviewer = await sandboxReviewer(config.key);
  if (!reviewer || typeof config.database === "string") redirect(`${path}?review=signin#reviewer-access`);
  const version = data.get("version");
  const serial = data.get("serial");
  if (typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version) ||
      typeof serial !== "string" || (serial && !caseUuid.test(serial))) redirect(`${path}?review=invalid`);
  return { config, cases: mongoSandboxCases(config.database), reviewer, id, path, version, serial };
}

export async function signInSandboxReviewer(data: FormData) {
  const config = await authorizedSandbox();
  const caseId = data.get("case");
  if (!config || typeof caseId !== "string" || !caseUuid.test(caseId)) redirect("/sandbox");
  const path = `/sandbox/cases/${caseId}`;
  const id = data.get("reviewer");
  const token = data.get("reviewerToken");
  const session = typeof id === "string" && typeof token === "string" && id.length <= 64 && token.length === 64
    ? openReviewerSession(config.key, id, token) : null;
  if (!session) redirect(`${path}?review=signin-failed#reviewer-access`);
  (await cookies()).set(reviewerCookie, session, { httpOnly: true, secure: await secureCookie(),
    sameSite: "strict", path: "/sandbox", maxAge: sandboxSessionSeconds });
  redirect(`${path}#reviewer-access`);
}

export async function signOutSandboxReviewer(data: FormData) {
  const id = data.get("case");
  (await cookies()).set(reviewerCookie, "", { httpOnly: true, sameSite: "strict", path: "/sandbox", maxAge: 0 });
  redirect(typeof id === "string" && caseUuid.test(id) ? `/sandbox/cases/${id}#reviewer-access` : "/sandbox");
}

export async function saveSandboxDecision(data: FormData) {
  const { cases, id, reviewer, path, version, serial } = await sandboxMutation(data);
  const proposal = data.get("proposal");
  const decision = data.get("decision");
  if (typeof proposal !== "string" || (decision !== "accepted" && decision !== "rejected" && decision !== "pending")) redirect(`${path}?review=invalid`);
  let request;
  try {
    request = await saveMongoSandboxDecision(cases, id, version, serial, proposal, decision, reviewer);
  } catch (error) {
    redirect(`${path}?review=${error instanceof SandboxCaseConflict ? "changed" : "invalid"}`);
  }
  redirect(`${path}?review=${decision === "pending" ? "undone" : "saved"}#request-${request}`);
}

export async function updateSandboxCase(data: FormData) {
  const { config, cases, id, reviewer, path, version, serial } = await sandboxMutation(data);
  const notice = data.get("replacementNotice");
  const files = data.getAll("documents").filter(isSelectedUpload);
  const selectedNotice = isSelectedUpload(notice) ? notice : undefined;
  const withdraw = data.getAll("withdraw").filter((item): item is string => typeof item === "string");
  const order = data.get("linkedOrder");
  let changed;
  try {
    const uploads = selectedNotice ? [selectedNotice, ...files] : files;
    if (exceedsSandboxUploadLimits(uploads.map(({ size }) => size))) throw new DocumentIngestError(sandboxUploadLimitMessage);
    changed = await updateMongoSandboxEvidence(cases, id, version, serial, reviewer, {
      documents: await Promise.all(files.map(readUpload)),
      notice: selectedNotice ? await readUpload(selectedNotice) : undefined,
      withdraw, orderId: typeof order === "string" && order.trim() ? order.trim() : undefined,
    }, config);
  } catch (error) {
    const problem = error instanceof DocumentIngestError || error instanceof PaymentImportError || error instanceof EvidenceMatchError
      ? error.message : "Could not save the case. Try again.";
    redirect(error instanceof SandboxCaseConflict ? `${path}?review=changed#case-edit`
      : `${path}?problem=${encodeURIComponent(problem)}#case-edit`);
  }
  redirect(`${path}?review=${changed ? "revised" : "unchanged"}#case-edit`);
}

export async function archiveSandboxCase(data: FormData) {
  const { cases, id, reviewer, path, version, serial } = await sandboxMutation(data);
  if (data.get("confirmArchive") !== "yes") redirect(`${path}?problem=Confirm+case+removal.#case-edit`);
  try {
    await archiveMongoSandboxCase(cases, id, version, serial, reviewer);
  } catch (error) {
    redirect(`${path}?review=${error instanceof SandboxCaseConflict ? "changed" : "invalid"}#case-edit`);
  }
  redirect("/sandbox?notice=archived");
}
