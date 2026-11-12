import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sandboxSessionSeconds } from "./sandbox-access.ts";

export const reviewerCookie = "paypal-rec-reviewer";
const reviewerId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const digestFormat = /^[a-f0-9]{64}$/;

function reviewerDigests() {
  try {
    const configured: unknown = JSON.parse(process.env.SANDBOX_REVIEWERS ?? "{}");
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) return new Map<string, string>();
    const entries = (Object.entries(configured) as [string, unknown][]).filter((entry): entry is [string, string] =>
      reviewerId.test(entry[0]) && typeof entry[1] === "string" && digestFormat.test(entry[1]));
    if (new Set(entries.map(([, digest]) => digest)).size !== entries.length) return new Map<string, string>();
    return new Map(entries);
  } catch {
    return new Map<string, string>();
  }
}

export function reviewersConfigured() {
  return reviewerDigests().size > 0;
}

function signature(key: string, digest: string, id: string, expiry: string) {
  return createHmac("sha256", key).update(`paypal-rec:reviewer:v1:${digest}:${id}:${expiry}`).digest("hex");
}

function equal(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function openReviewerSession(key: string, id: string, token: string, now = Date.now()) {
  const digest = reviewerDigests().get(id);
  if (!digest || token === key || !digestFormat.test(token) || !equal(digest, createHash("sha256").update(token).digest("hex"))) return null;
  const expiry = String(Math.floor(now / 1000) + sandboxSessionSeconds);
  return `${id}.${expiry}.${signature(key, digest, id, expiry)}`;
}

export function readReviewerSession(key: string, session: string | undefined, now = Date.now()) {
  const match = session && /^([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})\.(\d{1,12})\.([a-f0-9]{64})$/.exec(session);
  if (!match || Number(match[2]) <= Math.floor(now / 1000)) return null;
  const [, id, expiry, mac] = match;
  const digest = reviewerDigests().get(id);
  return digest && equal(signature(key, digest, id, expiry), mac) ? id : null;
}
