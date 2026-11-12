import assert from "node:assert/strict";
import test from "node:test";
import { reportSandboxStorageFailure } from "../lib/evidence/sandbox-storage-errors.ts";

test("Sandbox storage reports distinct actionable failures without leaking connection or case data", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const privateText = "mongodb://db-user:db-secret@example.invalid/demo CASE-CONTENT";
  const mongo = { uri: privateText, name: "test" };
  const sql = "postgresql://db-user:db-secret@example.invalid/demo";
  for (const [database, operation, error, expected, kind] of [
    [mongo, "list", Object.assign(new Error(privateText), { name: "MongoServerSelectionError" }), /whether Atlas allows connections from the app host/, "connection"],
    [mongo, "save", Object.assign(new Error(`bad auth: ${privateText}`), { name: "MongoServerError", code: 8000 }), /rejected the database credentials/, "authentication"],
    [mongo, "save", Object.assign(new Error(privateText), { code: 13 }), /denied the write/, "permission"],
    [sql, "save", Object.assign(new Error(privateText), { code: "42P01" }), /both database migrations/, "schema"],
    [mongo, "save", new Error(privateText), /unexpected MongoDB operation failed/, "unknown"],
  ]) {
    const result = reportSandboxStorageFailure(database, operation, error);
    assert.match(result, expected);
    const entry = log.mock.calls.at(-1).arguments[1];
    assert.equal(entry.kind, kind);
    assert.equal(entry.operation, operation);
    assert.ok(result.includes(entry.reference));
    assert.doesNotMatch(result + JSON.stringify(entry), /db-secret|CASE-CONTENT/);
  }
});
