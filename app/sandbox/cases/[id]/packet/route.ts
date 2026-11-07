import { cookies } from "next/headers";
import { buildEvidencePacket, PacketError, packetFilename } from "../../../../../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../../../../../lib/evidence/packet-archive.ts";
import { caseUuid, loadSandboxReview } from "../../../../../lib/evidence/sandbox-case.ts";
import { authorizedSandbox, sandboxReviewCookie, withSandboxDatabase } from "../../../access";

export const runtime = "nodejs";

function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorizedSandbox();
  const { id } = await context.params;
  if (!access || !caseUuid.test(id)) return redirectTo("/sandbox");
  try {
    const { review } = await withSandboxDatabase(access.database, (client) => loadSandboxReview(client, id));
    const saved = (await cookies()).get(sandboxReviewCookie(id))?.value;
    const packet = buildEvidencePacket(review, saved ? JSON.parse(saved) : { version: review.version, decisions: {} });
    return new Response(new Uint8Array(await createPacketArchive(packet)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${packetFilename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof PacketError ? error.status : 500;
    const feedback = code === 409 ? "changed" : code === 422 ? "empty" : "export-failed";
    return redirectTo(`/sandbox/cases/${id}?review=${feedback}`);
  }
}
