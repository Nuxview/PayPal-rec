import { buildEvidencePacket, PacketError, packetFilename } from "../../../../../lib/evidence/evidence-packet.ts";
import { createPacketArchive } from "../../../../../lib/evidence/packet-archive.ts";
import { loadMongoSandboxState, mongoSandboxCases, mongoSandboxPackets, retainSandboxPacket } from "../../../../../lib/evidence/mongo-sandbox-case.ts";
import { caseUuid } from "../../../../../lib/evidence/sandbox-case.ts";
import { authorizedSandbox } from "../../../access";

export const runtime = "nodejs";

function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorizedSandbox();
  const { id } = await context.params;
  if (!access || !caseUuid.test(id)) return redirectTo("/sandbox");
  if (typeof access.database === "string") return redirectTo(`/sandbox/cases/${id}?review=export-failed`);
  try {
    const submitted = await request.formData();
    const { review, row, decisions, currentEvents } = await loadMongoSandboxState(mongoSandboxCases(access.database), id);
    if (submitted.get("version") !== review.version || submitted.get("serial") !== (row.serial ?? "")) {
      throw new PacketError("The case changed.", 409);
    }
    const approvals = new Map([...currentEvents].filter(([, event]) => event.decision === "accepted")
      .map(([claim, event]) => [claim, { reviewer: event.reviewer, reviewed_at: event.at.toISOString(), evidence_version: event.evidenceVersion }]));
    const packet = buildEvidencePacket(review, { version: review.version, decisions }, approvals);
    const archive = await createPacketArchive(packet);
    const current = await mongoSandboxCases(access.database).findOne({
      _id: id, merchantKey: row.merchantKey, serial: row.serial, archived: { $exists: false },
    }, { projection: { _id: 1 } });
    if (!current || !row.serial) throw new PacketError("The case changed.", 409);
    const retained = await retainSandboxPacket(mongoSandboxPackets(access.database), id, row.serial, review.version, archive);
    return new Response(new Uint8Array(retained), {
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
