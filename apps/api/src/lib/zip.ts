import { deflateRawSync } from "node:zlib";

// Minimal ZIP archive writer (no external dependency).
// Each entry is stored with DEFLATE compression (falls back to STORE when
// compression would grow the payload, e.g. already-compressed formats).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

function dosDateTime(date: Date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

// Sanitizes a single path segment (file or folder name) for use in a ZIP entry.
export function sanitizeZipSegment(segment: string): string {
  const cleaned = segment.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+$/, "_").trim();
  return cleaned || "item";
}

// Ensures unique entry names inside the archive ("file.pdf" -> "file (2).pdf").
// Forward slashes are preserved — they define the archive's folder hierarchy.
export function uniqueZipName(name: string, used: Set<string>): string {
  const sanitized = name.split("/").map(sanitizeZipSegment).join("/");
  if (!used.has(sanitized)) {
    used.add(sanitized);
    return sanitized;
  }
  const dot = sanitized.lastIndexOf(".");
  const base = dot > 0 ? sanitized.slice(0, dot) : sanitized;
  const extension = dot > 0 ? sanitized.slice(dot) : "";
  let sequence = 2;
  while (used.has(`${base} (${sequence})${extension}`)) sequence += 1;
  const next = `${base} (${sequence})${extension}`;
  used.add(next);
  return next;
}

export function createZip(entries: ZipEntryInput[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  const now = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.day, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    chunks.push(localHeader, nameBuffer, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.day, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(0, 30); // extra + comment lengths
    centralHeader.writeUInt32LE(0, 34); // disk + internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);

    offset += 30 + nameBuffer.length + payload.length;
  }

  const centralStart = offset;
  const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, end]);
}
