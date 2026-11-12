import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { loadAgencyFixture } from "../lib/evidence/agency-fixture.ts";
import { scopeRecord } from "../lib/evidence/match-records.ts";
import { parseRestrictionNotice } from "../lib/evidence/notice.ts";
import { buildEvidencePacket } from "../lib/evidence/evidence-packet.ts";
import { buildReviewSnapshot } from "../lib/evidence/review-snapshot.ts";
import { loadSandboxPayment } from "../lib/paypal/sandbox.ts";

// shortcut: parses the app's generated forms only; use a browser test when browser automation is available.
function decodeHtml(text: string) {
  return text.replace(/&(quot|amp|lt|gt|#x27|#39);/g, (entity) => ({
    "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#x27;": "'", "&#39;": "'",
  })[entity]!);
}

function inputs(html: string) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => Object.fromEntries(
    [...tag.matchAll(/([\w:$-]+)="([^"]*)"/g)].map(([, name, value]) => [name, decodeHtml(value)]),
  ));
}

async function main() {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
  assert.ok(process.argv.length <= 3 && base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) &&
    base.href === `${base.origin}/`, "Usage: npm run demo:rehearse -- [http://127.0.0.1:PORT]");
  const results: string[] = [];
  let cookie = "";
  const request = (path: string, init: RequestInit = {}) => fetch(new URL(path, base), {
    ...init, redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { Cookie: cookie, Origin: base.origin, ...init.headers },
  });
  async function page(path: string) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    return (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  }
  const fixture = await loadAgencyFixture();
  const review = buildReviewSnapshot(fixture);
  assert.equal(review.proposals.length, 3);
  assert.deepEqual(review.followUp.map(({ title }) => title), ["Payer mismatch", "D3 · Missing delivery evidence"]);
  assert.deepEqual(review.excluded.map(({ sourceId }) => sourceId), ["SRC-10"]);
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  await page("/");
  const orderId = "4U2394441N253672E";
  const returned = decodeHtml(await page(`/sandbox/checkout-return?token=${orderId}&PayerID=PAYER-TEST-ONLY`));
  assert.ok(returned.includes(`npm run paypal:checkout -- capture ${orderId}`));
  assert.ok(returned.includes("Copy <code>capture_id</code>"));
  assert.ok(returned.includes("Browser review also needs a running PostgreSQL database"));
  assert.ok(!returned.includes("PAYER-TEST-ONLY"));
  for (const query of ["", "?token=%24%28invalid%29", `?token=${orderId}&token=OTHER`]) {
    assert.ok((await page(`/sandbox/checkout-return${query}`)).includes("capture YOUR_ORDER_ID"));
  }
  const cancelled = await page(`/sandbox/checkout-return?token=${orderId}&cancelled=1`);
  assert.ok(cancelled.includes("cancellation link"));
  assert.ok(!cancelled.includes(`capture ${orderId}`));
  results.push("Checkout return exposes the order/capture distinction and validated command; missing, invalid, repeated and cancelled tokens handled without calling PayPal");
  assert.ok(decodeHtml(await page("/demo/payment")).includes("Fixture replay · simulated payment"));
  let html = await page("/demo/review");
  const selection = () => JSON.parse(inputs(html).find(({ name }) => name === "review")!.value);
  assert.deepEqual(selection(), { version: review.version, decisions: {} });
  results.push("Health, home and labelled replay pages; fresh review has no decisions");

  const visible = decodeHtml(html.replace(/<!--.*?-->/g, ""));
  const intro = visible.slice(visible.indexOf('id="case-context"'), visible.indexOf('aria-label="Review steps"'));
  const scope = fixture.sources.map(scopeRecord).find((item) => item !== undefined);
  assert.ok(scope);
  assert.ok(fixture.payment.payee);
  assert.ok(fixture.payment.payer);
  for (const name of [fixture.payment.payee.name, fixture.payment.payer.name, scope.client, scope.project, ...scope.items.map(({ title }) => title)]) {
    assert.ok(intro.includes(name), `Missing case context: ${name}`);
  }
  assert.ok(intro.includes("Your job is to check what its records support"));
  const noticeSource = fixture.sources.find(({ source_id }) => source_id === fixture.report.notice_source_id);
  assert.ok(noticeSource);
  const requests = parseRestrictionNotice(noticeSource.source_id, noticeSource.source_content).requests;
  assert.deepEqual([...html.matchAll(/<section[^>]* id="request-([^"]+)"/g)].map(([, label]) => label), requests.map(({ label }) => label));
  for (const [index, request] of requests.entries()) {
    const start = visible.indexOf(`id="request-${request.label}"`);
    const end = index + 1 < requests.length ? visible.indexOf(`id="request-${requests[index + 1].label}"`) : visible.indexOf('id="excluded-title"');
    const section = visible.slice(start, end);
    assert.ok(section.includes(request.text));
    for (const item of [...review.proposals, ...review.followUp].filter((item) => item.request === request.label)) {
      assert.ok(section.includes(item.statement), `Statement is under the wrong request: ${item.id}`);
    }
  }
  assert.ok(html.indexOf('id="packet-download"') > html.indexOf('id="excluded-title"'));
  results.push("Fixture-based case introduction, notice-order request groups, related follow-ups and download after review");
  for (const item of [...review.proposals, ...review.followUp, ...review.excluded]) {
    for (const [id, excerpts] of Map.groupBy(item.citations, ({ sourceId }) => sourceId)) {
      assert.ok(visible.includes(`${id} · ${excerpts[0].name} (${excerpts.length} citations)`));
    }
    for (const citation of item.citations) {
      assert.ok(visible.includes(citation.location));
      for (const text of citation.lines?.map(({ text }) => text) ?? [citation.value!]) assert.ok(visible.includes(text));
    }
  }
  assert.equal([...html.matchAll(/<figure\b/g)].length,
    [...review.proposals, ...review.followUp, ...review.excluded].reduce((sum, item) => sum + item.citations.length, 0));
  results.push("Citations grouped by source; every original location and excerpt remains in server-rendered HTML");

  async function decide(id: string, decision: string) {
    const form = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
      .map(([, body]) => inputs(body)).find((fields) => fields.some(({ name, value }) => name === "proposal" && value === id));
    assert.ok(form, `Missing decision form for ${id}`);
    const data = new FormData();
    for (const { name, value } of form) if (name) data.set(name, value ?? "");
    assert.ok([...data.keys()].some((key) => key.startsWith("$ACTION_")), "Missing native Server Action");
    data.set("decision", decision);
    const response = await request("/demo/review", { method: "POST", body: data });
    assert.equal(response.status, 303);
    const target = review.proposals.find((proposal) => proposal.id === id);
    assert.ok(target);
    assert.equal(response.headers.get("location"), `/demo/review?review=saved#request-${target.request}`);
    const saved = response.headers.getSetCookie().find((value) => value.startsWith("paypal-rec-agency-review="));
    assert.ok(saved, "Decision cookie missing");
    cookie = saved.split(";")[0];
    await response.body?.cancel();
    html = await page("/demo/review");
    assert.equal(selection().decisions[id], decision, "Reload must preserve the decision");
  }
  async function download() {
    const chosen = selection();
    const response = await request("/api/demo/reviewed-packet", {
      method: "POST", body: new URLSearchParams({ review: JSON.stringify(chosen) }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(response.headers.get("cache-control"), "no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const files = unzipSync(bytes);
    assert.deepEqual(Object.keys(files).sort(), ["reviewed-evidence.json", "reviewed-evidence.pdf"]);
    assert.equal(strFromU8(files["reviewed-evidence.pdf"].subarray(0, 5)), "%PDF-");
    const packet = JSON.parse(strFromU8(files["reviewed-evidence.json"]));
    assert.deepEqual(packet, buildEvidencePacket(review, chosen));
    assert.equal(packet.mode, "synthetic_replay");
    assert.ok(!JSON.stringify(packet).includes("SRC-10"));
    return { bytes, files };
  }
  await decide(review.proposals[0].id, "accepted");
  await decide(review.proposals[1].id, "rejected");
  assert.deepEqual(selection().decisions, { [review.proposals[0].id]: "accepted", [review.proposals[1].id]: "rejected" });
  await download();
  results.push("Native accept/reject forms, cookie reload, and ZIP filtering of rejected/pending proposals");
  await decide(review.proposals[1].id, "accepted");
  await decide(review.proposals[2].id, "accepted");
  const { bytes, files } = await download();
  const stale = await request("/api/demo/reviewed-packet", {
    method: "POST", body: new URLSearchParams({ review: JSON.stringify({ ...selection(), version: "stale" }) }),
  });
  assert.equal(stale.status, 303);
  assert.equal(stale.headers.get("location"), "/demo/review?review=changed");
  await stale.body?.cancel();
  results.push("Changed decisions, all-accepted ZIP with open payer/D3 follow-ups, and stale export rejection");

  await assert.rejects(loadSandboxPayment("REHEARSAL-CAPTURE", { clientId: "stub", clientSecret: "stub" },
    async () => new Response(null, { status: 503 })), /HTTP 503/);
  cookie = "";
  html = await page("/demo/review");
  assert.deepEqual(selection().decisions, {});
  await decide(review.proposals[0].id, "accepted");
  await download();
  results.push("Stubbed Sandbox failure stays an error; explicitly switching to replay still supports review/export");

  await mkdir("output/pdf/demo-rehearsal", { recursive: true });
  await writeFile("output/pdf/demo-rehearsal/reviewed-evidence.zip", bytes);
  for (const [name, content] of Object.entries(files)) await writeFile(`output/pdf/demo-rehearsal/${name}`, content);
  const report = { timestamp: new Date().toISOString(), runtime: process.version, origin: base.origin,
    method: "Loopback HTTP, native forms without JavaScript execution; Sandbox failure stubbed", results,
    not_checked: ["Browser appearance/interaction", "Independent fresh-reviewer acceptance", "Actual PayPal or standalone PostgreSQL"] };
  await writeFile("output/pdf/demo-rehearsal/checks.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo rehearsal failed.");
  process.exitCode = 1;
});
