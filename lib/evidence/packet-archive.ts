import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { strToU8, zipSync } from "fflate";
import { type EvidencePacket } from "./evidence-packet.ts";

function renderPacketPdf(packet: EvidencePacket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 48;
    const label = packet.mode === "paypal_sandbox" ? "PAYPAL REC  /  PAYPAL SANDBOX" : "PAYPAL REC  /  SYNTHETIC DEMO";
    const doc = new PDFDocument({
      size: "A4", margin, bufferPages: true,
      info: { Title: "PayPal Rec - Reviewed evidence packet", Subject: `${label} draft` },
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
      if (doc.y + height > doc.page.height - margin) {
        doc.addPage();
        return true;
      }
      return false;
    }

    function section(title: string) {
      keepSpace(70);
      doc.moveDown(0.9);
      doc.font("Strong").fontSize(15).fillColor(ink).text(title);
      doc.moveDown(0.35);
    }

    doc.font("Strong").fontSize(10).fillColor(accent).text(label);
    doc.moveDown(0.5);
    doc.font("Strong").fontSize(28).fillColor(ink).text("Reviewed evidence packet");
    doc.moveDown(0.5);
    doc.font("Body").fontSize(11).fillColor(muted).text("Draft for merchant review. Nothing has been submitted.");
    doc.moveDown(0.5);
    doc.text(`Capture: ${packet.capture_id}`);

    section("Accepted claims");
    for (const claim of packet.accepted_claims) {
      keepSpace(150);
      doc.font("Strong").fontSize(12).fillColor(ink).text(`${claim.request}  |  ${claim.title}`);
      doc.moveDown(0.3);
      doc.font("Body").fontSize(10.5).fillColor(ink).text(claim.statement, { lineGap: 2 });
      if (claim.approval) {
        const { reviewer, reviewed_at, evidence_version } = claim.approval;
        doc.moveDown(0.25);
        doc.font("Body").fontSize(8).fillColor(muted).text(`Accepted by ${reviewer} on ${reviewed_at}`);
        doc.text(`Evidence version ${evidence_version}`);
      }
      doc.moveDown(0.5);
      for (const [sourceId, citations] of Map.groupBy(claim.citations, ({ sourceId }) => sourceId)) {
        const caption = `${sourceId}  |  ${citations[0].name}`;
        for (const [index, citation] of citations.entries()) {
          const excerpt = citation.lines
            ? citation.lines.map(({ number, text }) => `${number}: ${text}`).join("\n")
            : citation.value ?? "";
          doc.font("Strong").fontSize(9);
          const headingHeight = doc.heightOfString(caption, { width: width - 14 });
          doc.fontSize(8);
          const locationHeight = doc.heightOfString(citation.location, { width: 75 });
          doc.font("Body").fontSize(9);
          const newPage = keepSpace(Math.min(125,
            Math.max(locationHeight, doc.heightOfString(excerpt, { width: width - 95, lineGap: 2 })) + headingHeight + 12));
          // shortcut: repeat headings between excerpts; add page-level headings if individual excerpts span pages.
          if (index === 0 || newPage) {
            doc.font("Strong").fontSize(9).fillColor(accent)
              .text(`${caption}${index > 0 ? " (continued)" : ""}`, { indent: 7 });
            doc.moveDown(0.3);
          }
          const top = doc.y;
          const page = doc.page;
          doc.font("Strong").fontSize(8).fillColor(muted).text(citation.location, margin + 7, top, { width: 75 });
          doc.font("Body").fontSize(9).fillColor(ink).text(excerpt, margin + 95, top, { width: width - 95, lineGap: 2 });
          if (doc.page === page) doc.y = Math.max(doc.y, top + locationHeight);
          doc.x = margin;
          doc.moveDown(0.45);
        }
        doc.moveDown(0.3);
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
        .text(label, margin, y, { lineBreak: false });
      const pageNumber = `Page ${i + 1} of ${count}`;
      doc.text(pageNumber, doc.page.width - margin - doc.widthOfString(pageNumber), y, { lineBreak: false });
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
