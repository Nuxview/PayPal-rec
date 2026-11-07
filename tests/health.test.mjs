import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/health/route.ts";

test("health probe returns an uncached JSON response without service configuration", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});
