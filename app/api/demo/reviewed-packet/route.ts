import { loadAgencyFixture } from "../../../../lib/evidence/agency-fixture.ts";
import { buildEvidencePacket, PacketError, packetFilename } from "../../../../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../../../../lib/evidence/packet-archive.ts";
import { buildReviewSnapshot } from "../../../../lib/evidence/review-snapshot.ts";

export const runtime = "nodejs";

async function readDecisions(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) {
    throw new PacketError("Send the review decisions as JSON.", 400);
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
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof PacketError) throw error;
    throw new PacketError("Send valid JSON review decisions.", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const decisions = await readDecisions(request);
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
    if (error instanceof PacketError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Synthetic review packet generation failed.");
    return Response.json({ error: "The packet could not be generated. Try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
