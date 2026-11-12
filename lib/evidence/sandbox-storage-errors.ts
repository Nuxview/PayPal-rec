import { randomUUID } from "node:crypto";

type Database = string | { uri: string; name: string };
type Operation = "list" | "save";
type Kind = "configuration" | "authentication" | "permission" | "connection" | "schema" | "unknown";

function failureKind(error: unknown, mongo: boolean): Kind {
  if (!(error instanceof Error)) return "unknown";
  const { name, message, code, codeName } = error as Error & { code?: unknown; codeName?: unknown };

  if (mongo) {
    if (name === "MongoParseError" || name === "MongoInvalidArgumentError") return "configuration";
    if (code === 18 || codeName === "AuthenticationFailed" ||
      (name === "MongoServerError" && code === 8000 && /bad auth|authentication failed/i.test(message))) return "authentication";
    if (code === 13 || codeName === "Unauthorized") return "permission";
    if (code === 121 || codeName === "DocumentValidationFailure") return "schema";
  } else {
    if (code === "28P01" || code === "28000") return "authentication";
    if (code === "42501") return "permission";
    if (code === "42P01" || code === "42703" || code === "3F000") return "schema";
    if (code === "3D000") return "configuration";
  }
  if (["MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError", "MongoWaitQueueTimeoutError", "MongoTopologyClosedError"].includes(name) ||
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "ECONNRESET", "08P01", "08006"].includes(String(code)) ||
    (!mongo && message === "timeout expired")) return "connection";
  return "unknown";
}

export function reportSandboxStorageFailure(database: Database, operation: Operation, error: unknown): string {
  const mongo = typeof database !== "string";
  const backend = mongo ? "MongoDB" : "PostgreSQL";
  const kind = failureKind(error, mongo);
  const reference = randomUUID();
  const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
  const driverCode = typeof code === "number" && Number.isSafeInteger(code) ? code : undefined;
  // Driver messages and stacks may contain a connection string, account name, or record contents.
  console.error("PayPal Rec case storage failure", { reference, backend, operation, kind, driverCode });

  const action = operation === "save" ? "Could not save the case." : "Case storage is unavailable.";
  const detail: Record<Kind, string> = {
    configuration: mongo
      ? "Check that MONGODB_URI and MONGODB_DB are valid in the running app."
      : "Check that DATABASE_URL points to the intended PostgreSQL database.",
    authentication: `${backend} rejected the database credentials. Verify the database username and password in the running app.`,
    permission: operation === "save"
      ? `${backend} denied the write. Give the workspace database user write access to the selected database.`
      : `${backend} denied the read. Give the workspace database user read access to the selected database.`,
    connection: mongo
      ? "Could not reach MongoDB. Check the cluster status and whether Atlas allows connections from the app host."
      : "Could not reach PostgreSQL. Check the database host, port, and network access from the app.",
    schema: mongo
      ? "The MongoDB collection rejected the case format. Check the sandbox_cases collection validator."
      : "The PostgreSQL schema does not match the workspace. Check that both database migrations have been applied.",
    unknown: `An unexpected ${backend} operation failed. Check the server logs using the reference below.`,
  };
  return `${action} ${detail[kind]} Reference: ${reference}.`;
}
