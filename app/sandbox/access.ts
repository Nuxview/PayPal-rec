import { cookies } from "next/headers";
import pg from "pg";
import { importMongoSandboxCase, listMongoSandboxCases, loadMongoSandboxReview, mongoSandboxCases } from "../../lib/evidence/mongo-sandbox-case";
import { importSandboxCase, listSandboxCases, loadSandboxReview, type SandboxCaseInput } from "../../lib/evidence/sandbox-case";
import { hasSandboxSession, sandboxConfig, sandboxSessionCookie } from "../../lib/paypal/sandbox-access";
import { readReviewerSession, reviewerCookie } from "../../lib/paypal/reviewer-access";
import type { SandboxCredentials } from "../../lib/paypal/sandbox";

export async function authorizedSandbox() {
  const config = sandboxConfig();
  if (!config) return null;
  const jar = await cookies();
  return hasSandboxSession(config.key, jar.get(sandboxSessionCookie)?.value) ? config : null;
}

async function withPostgres<T>(database: string, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: database, connectionTimeoutMillis: 8_000, statement_timeout: 10_000 });
  try {
    await client.connect();
    return await work(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export function sandboxCaseStore(database: NonNullable<ReturnType<typeof sandboxConfig>>["database"]) {
  if (typeof database === "string") {
    return {
      importCase: (input: SandboxCaseInput, credentials: SandboxCredentials) =>
        withPostgres(database, (client) => importSandboxCase(client, input, credentials)),
      loadReview: (id: string) => withPostgres(database, (client) => loadSandboxReview(client, id)),
      listCases: () => withPostgres(database, listSandboxCases),
    };
  }
  return {
    importCase: async (input: SandboxCaseInput, credentials: SandboxCredentials) =>
      importMongoSandboxCase(await mongoSandboxCases(database), input, credentials),
    loadReview: async (id: string) => loadMongoSandboxReview(await mongoSandboxCases(database), id),
    listCases: async () => listMongoSandboxCases(await mongoSandboxCases(database)),
  };
}

export async function sandboxReviewer(key: string) {
  return readReviewerSession(key, (await cookies()).get(reviewerCookie)?.value);
}
