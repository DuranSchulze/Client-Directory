import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { AppError } from "@/lib/errors";
import { IMPORT_LIMITS } from "./contract";

function invalid(): never { throw new AppError(400, "Not a valid .xlsx file"); }
export function readArchive(data: Buffer): Map<string, Buffer> {
  if (data.length > IMPORT_LIMITS.bytes) throw new AppError(413, "Upload exceeds 10 MB");
  if (data.length < 22) invalid();
  let end = data.length - 22;
  for (; end >= Math.max(0, data.length - 65557); end--) {
    if (data.readUInt32LE(end) === 0x06054b50 && end + 22 + data.readUInt16LE(end + 20) === data.length) break;
  }
  if (end < 0 || data.readUInt32LE(end) !== 0x06054b50) invalid();
  const count = data.readUInt16LE(end + 10);
  if (count > IMPORT_LIMITS.entries) throw new AppError(400, "Workbook exceeds 2,000 zip entries");
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || data.readUInt16LE(end + 8) !== count) invalid();
  let pos = data.readUInt32LE(end + 16);
  if (pos + data.readUInt32LE(end + 12) !== end) invalid();
  const entries: { name: string; method: number; size: number; start: number; compressed: number }[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || data.readUInt32LE(pos) !== 0x02014b50) invalid();
    const flags = data.readUInt16LE(pos + 8), method = data.readUInt16LE(pos + 10);
    const compressed = data.readUInt32LE(pos + 20), size = data.readUInt32LE(pos + 24);
    const nameLength = data.readUInt16LE(pos + 28);
    const next = pos + 46 + nameLength + data.readUInt16LE(pos + 30) + data.readUInt16LE(pos + 32);
    const local = data.readUInt32LE(pos + 42);
    if (flags & 1 || ![0, 8].includes(method) || next > end || local + 30 > end || data.readUInt32LE(local) !== 0x04034b50) invalid();
    const name = data.subarray(pos + 46, pos + 46 + nameLength).toString("utf8");
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) invalid();
    const localNameLength = data.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + data.readUInt16LE(local + 28);
    if (start + compressed > data.readUInt32LE(end + 16) || data.readUInt16LE(local + 8) !== method || data.subarray(local + 30, local + 30 + localNameLength).toString("utf8") !== name) invalid();
    total += size;
    if (total > IMPORT_LIMITS.expandedBytes) throw new AppError(400, "Expanded workbook exceeds 100 MB");
    entries.push({ name, method, size, start, compressed });
    pos = next;
  }
  if (pos !== end) invalid();
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (files.has(entry.name)) invalid();
    const compressed = data.subarray(entry.start, entry.start + entry.compressed);
    let content: Buffer;
    try { content = entry.method === 8 ? inflateRawSync(compressed, { maxOutputLength: entry.size + 1 }) : compressed; }
    catch { invalid(); }
    if (content.length !== entry.size) invalid();
    files.set(entry.name, content);
  }
  if (!files.has("xl/workbook.xml") || !files.has("xl/_rels/workbook.xml.rels")) invalid();
  return files;
}
export function packArchive(files: Map<string, Buffer>): Buffer {
  const archive = XLSX.CFB.utils.cfb_new();
  for (const [name, content] of files) XLSX.CFB.utils.cfb_add(archive, name, content);
  return Buffer.from(XLSX.CFB.write(archive, { type: "buffer", fileType: "zip", compression: true }));
}
