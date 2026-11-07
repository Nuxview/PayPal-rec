import { loadAgencyFixture } from "../../../../lib/evidence/agency-fixture.ts";
import { buildEvidencePacket, PacketError, packetFilename } from "../../../../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../../../../lib/evidence/packet-archive.ts";
import { buildReviewSnapshot } from "../../../../lib/evidence/review-snapshot.ts";

export const runtime = "nodejs";

async function readDecisions(request: Request, contentType: string | undefined): Promise<unknown> {
  const form = contentType === "application/x-www-form-urlencoded";
  if ((!form && contentType !== "application/json") || !request.body) {
    throw new PacketError("Send review decisions as JSON or use the download form.", 400);
  }
  const reader = request.body.getReader();
  const limit = 16 * 1024;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new PacketError("The review payload is too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (!form) return JSON.parse(text);
    const selections = new URLSearchParams(text).getAll("review");
    if (selections.length !== 1) throw new PacketError("The download form must contain one review selection.", 400);
    return JSON.parse(selections[0]);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof PacketError) throw error;
    throw new PacketError("Send valid JSON review decisions.", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const form = contentType === "application/x-www-form-urlencoded";
  try {
    const decisions = await readDecisions(request, contentType);
    const review = buildReviewSnapshot(await loadAgencyFixture());
    const packet = buildEvidencePacket(review, decisions);
    const archive = await createPacketArchive(packet);
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${packetFilename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (form) {
      if (!(error instanceof PacketError)) console.error("Synthetic review packet generation failed.");
      const status = error instanceof PacketError ? error.status : 500;
      const feedback = status === 409 ? "changed" : status === 422 ? "empty" : "export-failed";
      return new Response(null, {
        status: 303,
        headers: { Location: `/demo/review?review=${feedback}`, "Cache-Control": "no-store" },
      });
    }
    if (error instanceof PacketError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Synthetic review packet generation failed.");
    return Response.json({ error: "The packet could not be generated. Try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
