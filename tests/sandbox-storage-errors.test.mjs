import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { mongoSandboxCases, mongoSandboxPackets } from "../lib/evidence/mongo-sandbox-case.ts";
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


test("a failed initial MongoDB connection is discarded so a later request can recover", async (t) => {
  const clients = [];
  const connect = t.mock.method(MongoClient.prototype, "connect", async function () {
    clients.push(this);
    if (clients.length === 1) throw new Error("first connection failed");
    return this;
  });
  const close = t.mock.method(MongoClient.prototype, "close", async () => {});
  const database = { uri: "mongodb://example.invalid:27017", name: "sandbox" };

  await assert.rejects(mongoSandboxCases(database), /first connection failed/);
  assert.equal(close.mock.calls[0].this, clients[0]);
  const [first, second, packets] = await Promise.all([
    mongoSandboxCases(database), mongoSandboxCases(database), mongoSandboxPackets(database),
  ]);
  assert.equal(first.collectionName, "sandbox_cases");
  assert.equal(second.collectionName, "sandbox_cases");
  assert.equal(packets.collectionName, "sandbox_case_packets");
  assert.notEqual(clients[1], clients[0]);
  assert.equal(connect.mock.callCount(), 2);
});
