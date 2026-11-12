import { packetFilename } from "../../../../../../lib/evidence/evidence-packet.ts";
import { mongoSandboxCases, mongoSandboxPackets } from "../../../../../../lib/evidence/mongo-sandbox-case.ts";
import { caseUuid, sandboxMerchant } from "../../../../../../lib/evidence/sandbox-case.ts";
import { authorizedSandbox } from "../../../../access";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; serial: string }> }) {
  const [access, { id, serial }] = await Promise.all([authorizedSandbox(), context.params]);
  if (!access || typeof access.database === "string" || !caseUuid.test(id) || !caseUuid.test(serial)) {
    return new Response(null, { status: 404 });
  }
  const scope = { merchantKey: sandboxMerchant };
  const cases = await mongoSandboxCases(access.database);
  const active = await cases.findOne({ ...scope, _id: id, archived: { $exists: false } },
    { projection: { _id: 1 } });
  if (!active) return new Response(null, { status: 404 });
  const packets = await mongoSandboxPackets(access.database);
  const packet = await packets.findOne({ ...scope, _id: `${id}/${serial}` });
  if (!packet) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(packet.archive.value()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="historical-${packetFilename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
