import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, join } from "node:path";
import manifest from "../../fixtures/restriction-agency-v1/inputs/manifest.json" with { type: "json" };

import { maxDocumentBatch, maxDocumentBytes } from "./document-limits.ts";

export { maxDocumentBatch, maxDocumentBytes } from "./document-limits.ts";

export class DocumentIngestError extends Error {}

export type EvidenceDocument = {
  source_id: string;
  source_kind: string;
  source_origin: "merchant_provided" | "synthetic_replay";
  source_name: string;
  source_content: string;
};

const fixtureKinds = new Set([
  "merchant_provided_simulated_notice",
  "statement_of_work",
  "invoice",
  "client_correspondence",
  "project_record",
]);

function validateName(name: string) {
  if (name.length > 160 || !/^[^/\\\x00-\x1f\x7f]+\.txt$/i.test(name)) {
    throw new DocumentIngestError("Only .txt documents are supported.");
  }
}

export function decodeDocument(bytes: Uint8Array): string {
  if (bytes.byteLength > maxDocumentBytes) {
    throw new DocumentIngestError("A document exceeds the 256 KiB size limit.");
  }
  let content;
  try {
    // Keep any BOM and original newlines so the stored snapshot preserves source locations.
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new DocumentIngestError("Documents must contain valid UTF-8 text.");
  }
  if (!content.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content) ||
    content.trimStart().startsWith("%PDF-")) {
    throw new DocumentIngestError("Documents must contain non-empty plain text.");
  }
  return content;
}

export function merchantDocument(name: string, bytes: Uint8Array): EvidenceDocument {
  validateName(name);
  return {
    source_id: `DOC-${createHash("sha256").update(bytes).digest("hex")}`,
    source_kind: "merchant_document",
    source_origin: "merchant_provided",
    source_name: name,
    source_content: decodeDocument(bytes),
  };
}

export function isSelectedUpload(entry: FormDataEntryValue | null): entry is File {
  // Next's multipart decoder converts an empty file input's missing filename to "undefined".
  return entry !== null && typeof entry !== "string" && Boolean(entry.name) &&
    !(entry.name === "undefined" && entry.size === 0 && entry.type === "application/octet-stream");
}

async function readDocument(path: string | URL) {
  try {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new DocumentIngestError("Choose a regular .txt file.");
      if (info.size > maxDocumentBytes) {
        throw new DocumentIngestError("A document exceeds the 256 KiB size limit.");
      }
      // Bound the read even if the file grows after stat.
      const buffer = Buffer.alloc(maxDocumentBytes + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const bytes = buffer.subarray(0, offset);
      return { text: decodeDocument(bytes), digest: createHash("sha256").update(bytes).digest("hex") };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof DocumentIngestError) throw error;
    throw new DocumentIngestError("A document could not be read.");
  }
}

export async function loadMerchantDocuments(paths: string[]): Promise<EvidenceDocument[]> {
  if (!paths.length || paths.length > maxDocumentBatch) {
    throw new DocumentIngestError("Provide between 1 and 25 documents per import.");
  }
  const unique = new Map<string, EvidenceDocument>();
  for (const path of paths) {
    const name = basename(path);
    validateName(name);
    const { text, digest } = await readDocument(path);
    const id = `DOC-${digest}`;
    if (!unique.has(id)) {
      unique.set(id, {
        source_id: id,
        source_kind: "merchant_document",
        source_origin: "merchant_provided",
        source_name: name,
        source_content: text,
      });
    }
  }
  return [...unique.values()];
}

export async function loadFixtureDocuments(): Promise<EvidenceDocument[]> {
  if (manifest.data_mode !== "synthetic_replay" || manifest.fixture_version !== 1) {
    throw new DocumentIngestError("The fixture manifest does not describe a supported replay.");
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const digests = new Set<string>();
  const documents: EvidenceDocument[] = [];
  for (const source of manifest.sources) {
    if (!/^SRC-[0-9]{2}$/.test(source.id) || ids.has(source.id) || names.has(source.path)) {
      throw new DocumentIngestError("The fixture has invalid or duplicate source references.");
    }
    ids.add(source.id);
    names.add(source.path);
    if (source.id === "SRC-02" && source.kind === "paypal_payment_fixture" && source.path === "paypal-payment.json") {
      continue; // The payment importer owns this source.
    }
    if (!fixtureKinds.has(source.kind) || source.id === "SRC-02") {
      throw new DocumentIngestError("The fixture contains an unsupported document kind.");
    }
    validateName(source.path);
    const path = join(process.cwd(), "fixtures/restriction-agency-v1/inputs", source.path);
    const { text, digest } = await readDocument(path);
    if (digests.has(digest)) throw new DocumentIngestError("The fixture repeats a document under another source ID.");
    digests.add(digest);
    documents.push({
      source_id: source.id,
      source_kind: source.kind,
      source_origin: "synthetic_replay",
      source_name: source.path,
      source_content: text,
    });
  }
  return documents;
}
