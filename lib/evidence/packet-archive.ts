import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { strToU8, zipSync } from "fflate";
import { type EvidencePacket } from "./evidence-packet.ts";

function renderPacketPdf(packet: EvidencePacket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 48;
    const doc = new PDFDocument({
      size: "A4", margin, bufferPages: true,
      info: { Title: "PayPal Rec - Reviewed evidence packet", Subject: "Synthetic demo draft" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const fonts = join(process.cwd(), "node_modules/@fontsource/inter/files");
    doc.registerFont("Body", readFileSync(join(fonts, "inter-latin-400-normal.woff")));
    doc.registerFont("Strong", readFileSync(join(fonts, "inter-latin-600-normal.woff")));
    const width = doc.page.width - margin * 2;
    const ink = "#10263c";
    const muted = "#425870";
    const accent = "#075981";

    function keepSpace(height: number) {
      if (doc.y + height > doc.page.height - margin) doc.addPage();
    }

    function section(title: string) {
      keepSpace(70);
      doc.moveDown(0.9);
      doc.font("Strong").fontSize(15).fillColor(ink).text(title);
      doc.moveDown(0.35);
    }

    doc.font("Strong").fontSize(10).fillColor(accent).text("PAYPAL REC  /  SYNTHETIC DEMO");
    doc.moveDown(0.5);
    doc.font("Strong").fontSize(28).fillColor(ink).text("Reviewed evidence packet");
    doc.moveDown(0.5);
    doc.font("Body").fontSize(11).fillColor(muted).text("Draft for merchant review. Nothing has been submitted.");
    doc.moveDown(0.5);
    doc.text(`Capture: ${packet.capture_id}`);

    section("Accepted claims");
    for (const claim of packet.accepted_claims) {
      keepSpace(92);
      doc.font("Strong").fontSize(12).fillColor(ink).text(`${claim.request}  |  ${claim.title}`);
      doc.moveDown(0.3);
      doc.font("Body").fontSize(10.5).fillColor(ink).text(claim.statement, { lineGap: 2 });
      doc.moveDown(0.5);
      for (const citation of claim.citations) {
        const excerpt = citation.lines
          ? citation.lines.map(({ number, text }) => `${number}: ${text}`).join("\n")
          : citation.value ?? "";
        const caption = `${citation.sourceId}  |  ${citation.name}  |  ${citation.location}`;
        doc.font("Body").fontSize(9);
        keepSpace(Math.min(125, doc.heightOfString(excerpt, { width: width - 14, lineGap: 2 }) + 32));
        doc.font("Strong").fontSize(9).fillColor(accent).text(caption, { indent: 7 });
        doc.font("Body").fontSize(9).fillColor(muted).text(excerpt, { indent: 7, lineGap: 2 });
        doc.moveDown(0.45);
      }
      doc.moveDown(0.4);
    }

    section("Open gaps");
    if (!packet.gaps.length) {
      doc.font("Body").fontSize(10.5).fillColor(muted).text("No open gaps were flagged in this review.");
    }
    for (const gap of packet.gaps) {
      keepSpace(55);
      doc.font("Strong").fontSize(11).fillColor(ink).text(`${gap.request}  |  ${gap.title}`);
      doc.font("Body").fontSize(10.5).fillColor(muted).text(gap.next_evidence, { lineGap: 2 });
      doc.moveDown(0.6);
    }

    if (packet.omitted_proposals.length) {
      section("Proposals not included");
      for (const proposal of packet.omitted_proposals) {
        keepSpace(24);
        doc.font("Body").fontSize(10).fillColor(muted)
          .text(`${proposal.request}  |  ${proposal.title} - ${proposal.status}`, { lineGap: 2 });
      }
    }

    const { count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - 32;
      doc.moveTo(margin, y - 7).lineTo(doc.page.width - margin, y - 7).lineWidth(0.5).strokeColor("#c4d1dd").stroke();
      doc.font("Body").fontSize(8).fillColor(muted)
        .text("PAYPAL REC  /  SYNTHETIC DEMO", margin, y, { lineBreak: false });
      const label = `Page ${i + 1} of ${count}`;
      doc.text(label, doc.page.width - margin - doc.widthOfString(label), y, { lineBreak: false });
    }
    doc.end();
  });
}

export async function createPacketArchive(packet: EvidencePacket) {
  const pdf = await renderPacketPdf(packet);
  return zipSync({
    "reviewed-evidence.pdf": pdf,
    "reviewed-evidence.json": strToU8(JSON.stringify(packet, null, 2) + "\n"),
  });
}
