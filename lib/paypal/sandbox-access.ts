import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const sandboxSessionCookie = "paypal-rec-sandbox-session";
export const sandboxSessionSeconds = 8 * 60 * 60;

export function sandboxConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = env.PAYPAL_SANDBOX_WEB_KEY?.trim();
  const database = env.DATABASE_URL?.trim();
  const clientId = env.PAYPAL_SANDBOX_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_SANDBOX_CLIENT_SECRET?.trim();
  return key && key.length >= 24 && database && clientId && clientSecret
    ? { key, database, clientId, clientSecret }
    : null;
}

function equal(left: string, right: string) {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(left), digest(right));
}

function sign(key: string, expiry: number) {
  return createHmac("sha256", key).update(`paypal-rec:sandbox:v1:${expiry}`).digest("base64url");
}

export function openSandboxSession(key: string, supplied: string, now = Date.now()) {
  if (!equal(supplied, key)) return null;
  const expiry = Math.floor(now / 1000) + sandboxSessionSeconds;
  return `${expiry}.${sign(key, expiry)}`;
}

export function hasSandboxSession(key: string, token: string | undefined, now = Date.now()) {
  const match = token && /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  return expiry > Math.floor(now / 1000) && equal(match[2], sign(key, expiry));
}
