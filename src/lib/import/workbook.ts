import * as XLSX from "xlsx";
import { AppError } from "@/lib/errors";
import { nullText } from "@/lib/normalize";
import { CSV_COLUMNS } from "@/lib/csv";
import { IMPORT_LIMITS, type ImportBuckets } from "./contract";
import { packArchive, readArchive } from "./archive";

export type Tab = "companies" | "probity" | "suppliers" | "deptEmails";
export type Table = { sheet: string; tab: Tab; headerRow: number; columns: Map<number, string>; cells: XLSX.CellObject[][]; date1904: boolean };
export function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function cellText(cell: XLSX.CellObject | undefined): string | null {
  if (!cell) return null;
  const text = typeof cell.v === "number" && /^[+-]?\d+(?:\.\d*)?e[+-]?\d+$/i.test(cell.w ?? "") ? String(cell.v) : cell.w ?? String(cell.v ?? "");
  return nullText(text);
}
const mainAliases: Record<string, string> = Object.fromEntries(CSV_COLUMNS.map(([header, key]) => [normalize(header), key]));
Object.assign(mainAliases, { companyname: "name", registeredname: "name", tinnumber: "tin", contactpersondesignation: "contactPeople", contactperson: "contactPeople", emailaddress: "contactEmails", emailaddresses: "contactEmails", email: "contactEmails", emailforsi: "siEmail", accountno: "accountNo", accountnumber: "accountNo", engagementstatus: "engagementStatus" });
const aliases: Record<Tab, Record<string, string>> = {
  companies: mainAliases,
  probity: { company: "companyListed", companylisted: "companyListed", contact: "contactPerson", contactperson: "contactPerson", emailaddress: "emails", emailaddresses: "emails", email: "emails", service: "service", linkofsignedagreement: "agreementUrl", datedrafted: "draftedOn", referencenumber: "referenceNo", remarksstatus: "remarks", remarks: "remarks" },
  suppliers: { suppliercontractor: "name", supplier: "name", name: "name", particulars: "particulars", contactdetails: "details", contactperson: "contactName", email: "emails", emailaddress: "emails", contactno: "phones" },
  deptEmails: { name: "name", title: "title", designation: "title", emailaddress: "emails", email: "emails", otheremailaddress: "emails", department: "department" },
};
const tabs: Record<string, Tab> = { allclientsdatabase: "companies", probityclients: "probity", opssupplier: "suppliers", alldeptemails: "deptEmails" };
function header(cells: XLSX.CellObject[][], tab: Tab) {
  for (let r = 0; r < Math.min(10, cells.length); r++) {
    const columns = new Map<number, string>();
    (cells[r] ?? []).forEach((cell, c) => { const key = aliases[tab][normalize(cellText(cell) ?? "")]; if (key) columns.set(c, key); });
    const keys = new Set(columns.values());
    if (tab === "companies" ? keys.has("name") && (keys.has("contactEmails") || keys.has("siEmail")) : tab === "probity" ? keys.has("companyListed") : tab === "suppliers" ? keys.has("name") || keys.has("particulars") : keys.has("emails")) return { r, columns };
  }
  return null;
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1], match[2]]));
}
function worksheetExtent(xml: string): number {
  let rowNumber = 0, lastDataRow = 0;
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attributes(row[1]).r;
    if (r !== undefined && !/^[1-9]\d*$/.test(r)) throw new AppError(400, "Invalid worksheet coordinates");
    rowNumber = r === undefined ? rowNumber + 1 : Number(r);
    if (!Number.isSafeInteger(rowNumber)) throw new AppError(400, "Invalid worksheet coordinates");
    let column = 0;
    for (const cell of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attributes(cell[1]).r;
      if (ref !== undefined) {
        const position = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
        if (!position || Number(position[2]) !== rowNumber) throw new AppError(400, "Invalid worksheet coordinates");
        column = 0;
        for (const letter of position[1]) column = column * 26 + letter.charCodeAt(0) - 64;
      } else column++;
      if (!/<(?:v|is|f)\b/.test(cell[2] ?? "")) continue;
      if (column > IMPORT_LIMITS.columns) throw new AppError(400, "Worksheet exceeds 200 columns");
      if (rowNumber > IMPORT_LIMITS.rows + 10) throw new AppError(400, "Workbook exceeds 20,000 data rows");
      lastDataRow = Math.max(lastDataRow, rowNumber);
    }
  }
  return lastDataRow;
}
function sheetPaths(files: Map<string, Buffer>): string[] {
  const rels = new Map([...files.get("xl/_rels/workbook.xml.rels")!.toString().matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => { const a = attributes(tag); return [a.Id, a.Target]; }));
  return [...files.get("xl/workbook.xml")!.toString().matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const target = rels.get(attributes(tag)["r:id"]) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    if (!path.startsWith("xl/worksheets/") || path.split("/").includes("..") || !files.has(path)) throw new AppError(400, "Invalid worksheet path");
    return path;
  });
}
export function readTables(data: Buffer, buckets: ImportBuckets): Table[] {
  const files = readArchive(data);
  const paths = sheetPaths(files);
  const extents = new Map<string, number>();
  // Ignore forged dimension hints before either bounded SheetJS read.
  for (const path of paths) {
    const xml = files.get(path)!.toString();
    extents.set(path, worksheetExtent(xml));
    files.set(path, Buffer.from(xml.replace(/<dimension\b[^>]*\/?\s*>/g, "")));
  }
  let first: XLSX.WorkBook;
  try { first = XLSX.read(packArchive(files), { type: "buffer", dense: true, sheetRows: 10, cellNF: true }); }
  catch { throw new AppError(400, "Not a valid .xlsx file"); }
  const selected = first.SheetNames.map((sheet, index) => ({ sheet, index, tab: tabs[normalize(sheet)] })).filter((item) => item.tab);
  if (selected.filter((item) => item.tab === "companies").length !== 1 || new Set(selected.map((item) => item.tab)).size !== selected.length) throw new AppError(400, "Expected exactly one All Clients Database sheet and no duplicate import tabs");
  const tables: Omit<Table, "cells">[] = [];
  for (const { sheet, index, tab } of selected) {
    const found = header(first.Sheets[sheet]["!data"] ?? [], tab);
    if (!found) {
      if (tab === "companies") throw new AppError(400, "Missing REGISTERED NAME and EMAIL headers in first 10 rows");
      buckets.unmatchedHeaders.push({ sheet, row: 1, reason: "No recognized header row; tab skipped" });
      continue;
    }
    for (const [c, cell] of (first.Sheets[sheet]["!data"]?.[found.r] ?? []).entries()) {
      const text = cellText(cell);
      if (text && !found.columns.has(c) && !/^(proposechanges|maamghelapproval|timestamp|clientforpayroll|no|number)$/.test(normalize(text))) buckets.unmatchedHeaders.push({ sheet, row: found.r + 1, field: text, reason: "Unmatched header" });
    }
    const path = paths[index];
    const xml = files.get(path)!.toString();
    if (extents.get(path)! - found.r - 1 > IMPORT_LIMITS.rows) throw new AppError(400, "Workbook exceeds 20,000 data rows");
    // Shift headings to row 1 so the 20,001-row bound also allows titles above a header.
    let rowNumber = 0;
    const normalized = xml.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (_row, attrs: string, body: string | undefined) => {
      const r = attributes(attrs).r;
      rowNumber = r === undefined ? rowNumber + 1 : Number(r);
      if (rowNumber <= found.r) return "";
      const shifted = rowNumber - found.r;
      const shiftedAttrs = r === undefined ? `${attrs} r="${shifted}"` : attrs.replace(/(\br=["'])\d+/, `$1${shifted}`);
      if (body === undefined) return `<row${shiftedAttrs}/>`;
      const cells = body.replace(/(<c\b[^>]*\br=["'][A-Z]+)(\d+)/g, (_all, prefix, n) => prefix + (Number(n) - found.r));
      return `<row${shiftedAttrs}>${cells}</row>`;
    });
    files.set(path, Buffer.from(normalized));
    tables.push({ sheet, tab, headerRow: found.r + 1, columns: found.columns, date1904: !!first.Workbook?.WBProps?.date1904 });
  }
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(packArchive(files), { type: "buffer", dense: true, sheetRows: 20001, cellNF: true }); }
  catch { throw new AppError(400, "Not a valid .xlsx file"); }
  return tables.map((table) => ({ ...table, cells: workbook.Sheets[table.sheet]["!data"] ?? [] }));
}
