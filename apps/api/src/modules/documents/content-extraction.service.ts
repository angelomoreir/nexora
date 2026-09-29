import type { Readable } from "node:stream";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "../../lib/prisma.js";
import { storage } from "../../services/storage/index.js";

const MAX_EXTRACTION_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 200_000;

async function readBuffer(key: string): Promise<Buffer> {
  const stream: Readable = await storage.get(key);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(value);
    length += value.length;
    if (length > MAX_EXTRACTION_BYTES) {
      stream.destroy();
      throw new Error("file too large for content extraction");
    }
  }
  return Buffer.concat(chunks);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function extractNxdocText(json: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
    if (Array.isArray(record.content)) record.content.forEach(walk);
    if (Array.isArray(record.cells)) record.cells.forEach(walk);
  };
  walk(json);
  return parts.join(" ");
}

function extractNxsheetText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const record = json as { cells?: Record<string, unknown>; sheets?: { cells?: Record<string, unknown> }[] };
  if (Array.isArray(record.sheets)) {
    return record.sheets
      .flatMap((sheet) => Object.values(sheet.cells ?? {}))
      .map((value) => (typeof value === "string" && !value.startsWith("=") ? value : typeof value === "number" ? String(value) : ""))
      .filter(Boolean)
      .join(" ");
  }
  const cells = record.cells ?? {};
  return Object.values(cells)
    .map((value) => (typeof value === "string" && !value.startsWith("=") ? value : typeof value === "number" ? String(value) : ""))
    .filter(Boolean)
    .join(" ");
}

export async function extractDocumentText(storageKey: string, mimeType: string, extension: string): Promise<string | null> {
  const mime = mimeType.toLowerCase();
  const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const isNxdoc = ext === ".nxdoc" || mime === "application/vnd.nexora.doc+json";
  const isNxsheet = ext === ".nxsheet" || mime === "application/vnd.nexora.sheet+json";
  const supported = isNxdoc || isNxsheet || mime === "text/plain" || mime === "text/csv" || mime === "application/pdf"
    || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || ext === ".txt" || ext === ".csv" || ext === ".pdf" || ext === ".docx";
  if (!supported) return null;
  const buffer = await readBuffer(storageKey);
  if (buffer.length > MAX_EXTRACTION_BYTES) return null;
  if (isNxdoc || isNxsheet) {
    try {
      const json = JSON.parse(buffer.toString("utf8")) as unknown;
      return normalize(isNxdoc ? extractNxdocText(json) : extractNxsheetText(json));
    } catch {
      return null;
    }
  }
  if (mime === "text/plain" || mime === "text/csv" || ext === ".txt" || ext === ".csv") {
    return normalize(buffer.toString("utf8"));
  }
  if (mime === "application/pdf" || ext === ".pdf") {
    const result = await pdfParse(buffer);
    return normalize(result.text ?? "");
  }
  if (ext === ".docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return normalize(result.value ?? "");
  }
  return null;
}

export async function indexDocumentContent(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, tenantId: true, storageKey: true, mimeType: true, extension: true } });
  if (!document || !document.storageKey) return;
  const text = await extractDocumentText(document.storageKey, document.mimeType, document.extension);
  if (text == null) {
    await prisma.documentContent.deleteMany({ where: { documentId: document.id } });
    return;
  }
  const version = await prisma.documentVersion.findFirst({ where: { tenantId: document.tenantId, documentId: document.id, storageKey: document.storageKey }, select: { id: true } });
  await prisma.documentContent.upsert({
    where: { documentId: document.id },
    create: { tenantId: document.tenantId, documentId: document.id, text, extractedAt: new Date(), versionId: version?.id ?? null },
    update: { text, extractedAt: new Date(), versionId: version?.id ?? null }
  });
}
