"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DocumentIngestError, maxDocumentBatch, maxDocumentBytes, merchantDocument } from "../../lib/evidence/documents";
import { EvidenceMatchError } from "../../lib/evidence/match-store";
import { caseUuid, importSandboxCase, loadSandboxReview } from "../../lib/evidence/sandbox-case";
import { writeReviewDecision } from "../../lib/evidence/review-state";
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
  if (!token) redirect("/sandbox?notice=key");
  (await cookies()).set(sandboxSessionCookie, token, {
    httpOnly: true, sameSite: "strict", secure: await secureCookie(),
    path: "/sandbox", maxAge: sandboxSessionSeconds,
  });
  redirect("/sandbox");
}

export async function lockSandbox() {
  (await cookies()).set(sandboxSessionCookie, "", { path: "/sandbox", maxAge: 0, httpOnly: true, sameSite: "strict" });
  redirect("/sandbox");
}

async function readUpload(entry: File) {
  return merchantDocument(entry.name, new Uint8Array(await entry.arrayBuffer()));
}

export async function createSandboxCase(data: FormData) {
  const config = await authorizedSandbox();
  if (!config) redirect("/sandbox");
  const capture = data.get("capture");
  const order = data.get("order");
  const notice = data.get("notice");
  const files = data.getAll("documents").filter((item): item is File => typeof item !== "string" && Boolean(item.name));
  let id;
  try {
    if (typeof capture !== "string" || !capture.trim()) throw new PaymentImportError("Enter a Sandbox capture ID.");
    if (!notice || typeof notice === "string" || !notice.name) throw new DocumentIngestError("Choose the notice text file.");
    if (files.length + 1 > maxDocumentBatch || [notice, ...files].some(({ size }) => size > maxDocumentBytes) ||
      [notice, ...files].reduce((sum, { size }) => sum + size, 0) > 768 * 1024) {
      throw new DocumentIngestError("Use up to 25 text files, 256 KiB per file and 768 KiB total.");
    }
    const noticeDoc = await readUpload(notice);
    const documents = await Promise.all(files.map(readUpload));
    id = await withSandboxDatabase(config.database, (client) => importSandboxCase(client, {
      captureId: capture.trim(),
      orderId: typeof order === "string" ? order.trim() || undefined : undefined,
      notice: noticeDoc,
      documents,
    }, config));
  } catch (error) {
    const message = error instanceof PaymentImportError || error instanceof DocumentIngestError || error instanceof EvidenceMatchError
      ? error.message
      : "Could not save the case. Check the database connection and apply both migrations.";
    redirect(`/sandbox?problem=${encodeURIComponent(message)}`);
  }
  redirect(`/sandbox/cases/${id}`);
}

export async function saveSandboxDecision(data: FormData) {
  const config = await authorizedSandbox();
  const id = data.get("case");
  if (!config || typeof id !== "string" || !caseUuid.test(id)) redirect("/sandbox");
  const path = `/sandbox/cases/${id}`;
  const proposal = data.get("proposal");
  const decision = data.get("decision");
  if (typeof proposal !== "string" || (decision !== "accepted" && decision !== "rejected")) redirect(`${path}?review=invalid`);
  const loaded = await withSandboxDatabase(config.database, (client) => loadSandboxReview(client, id)).catch(() => null);
  if (!loaded || data.get("version") !== loaded.review.version) redirect(`${path}?review=changed`);
  const jar = await cookies();
  const name = sandboxReviewCookie(id);
  const target = loaded.review.proposals.find((item) => item.id === proposal);
  const saved = writeReviewDecision(jar.get(name)?.value ?? null, loaded.review, proposal, decision);
  if (!saved || !target) redirect(`${path}?review=invalid`);
  jar.set(name, saved, { httpOnly: true, sameSite: "strict", secure: await secureCookie(), path, maxAge: sandboxSessionSeconds });
  redirect(`${path}?review=saved#request-${target.request}`);
}
