export const maxDocumentBytes = 256 * 1024;
export const maxDocumentBatch = 25;
const maxSandboxUploadBytes = 768 * 1024;

export const sandboxUploadLimitMessage = "Use up to 25 text files, 256 KiB per file and 768 KiB total.";

export function exceedsSandboxUploadLimits(sizes: number[]) {
  return sizes.length > maxDocumentBatch || sizes.some((size) => size > maxDocumentBytes) ||
    sizes.reduce((sum, size) => sum + size, 0) > maxSandboxUploadBytes;
}
