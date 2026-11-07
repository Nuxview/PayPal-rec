import { cookies } from "next/headers";
import pg from "pg";
import { hasSandboxSession, sandboxConfig, sandboxSessionCookie } from "../../lib/paypal/sandbox-access";

export async function authorizedSandbox() {
  const config = sandboxConfig();
  if (!config) return null;
  const jar = await cookies();
  return hasSandboxSession(config.key, jar.get(sandboxSessionCookie)?.value) ? config : null;
}

export async function withSandboxDatabase<T>(database: string, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: database, connectionTimeoutMillis: 8_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    return await work(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export const sandboxReviewCookie = (id: string) => `paypal-rec-sandbox-review-${id}`;
