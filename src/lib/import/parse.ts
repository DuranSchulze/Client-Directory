import * as XLSX from "xlsx";
import { BILLING_ROLES, EFPS, ENTITIES } from "@/lib/enums";
import { COMPANY_DATE_FIELDS, COMPANY_TEXT_FIELDS } from "@/lib/api-types";
import type { CompanyInput, ContactInput, DeptEmailInput, ProbityInput, SupplierInput } from "@/lib/api-types";
import { EMAIL_RE, TIN_RE, nameKey, normEmail, nullText, toE164 } from "@/lib/normalize";
import { emptyBuckets, type ImportBuckets } from "./contract";
import { cellText, readTables, type Table } from "./workbook";

export type Source = { sheet: string; row: number };
export type ParsedCompany = Source & { company: CompanyInput; contacts: ContactInput[] };
export type ParsedImport = { companies: ParsedCompany[]; deptEmails: (Source & { value: DeptEmailInput })[]; suppliers: (Source & { value: SupplierInput })[]; probity: (Source & { value: ProbityInput })[]; buckets: ImportBuckets };
const EMAIL_SCAN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}/gi;
function issue(buckets: ImportBuckets, bucket: keyof ImportBuckets, source: Source, reason: string, field?: string) {
  buckets[bucket].push({ ...source, reason, ...(field ? { field } : {}) });
}
export function parseEmails(value: string | null, source: Source, buckets: ImportBuckets, extract = false): string[] {
  if (!value) return [];
  const tokens = extract ? value.match(EMAIL_SCAN) ?? [] : value.split(/\s+\/\s+|[\n\r,;]+/).map((token) => token.trim()).filter(Boolean);
  const emails: string[] = [];
  for (const token of tokens) {
    if (!nullText(token)) continue;
    const email = normEmail(token);
    const local = email.split("@")[0];
    if (!EMAIL_RE.test(email) || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) issue(buckets, "invalidEmails", source, "Invalid email dropped", "emails");
    else emails.push(email);
  }
  if (extract && value.replace(EMAIL_SCAN, "").replace(/[\s,;/<>"']/g, "")) issue(buckets, "invalidEmails", source, "Unrecognized email text dropped", "emails");
  return [...new Set(emails)];
}
function phoneList(value: string | null, source: Source, buckets: ImportBuckets): string[] {
  if (!value) return [];
  return [...new Set(value.split(/\s+\/\s+|[\n\r,;]+/).flatMap((value) => {
    if (!nullText(value)) return [];
    const phone = toE164(value.trim());
    if (!phone) issue(buckets, "invalidValues", source, "Invalid phone dropped", "phones");
    return phone ? [phone] : [];
  }))];
}
export function parseDate(cell: XLSX.CellObject | undefined, date1904 = false): string | null {
  if (!cell || !nullText(cellText(cell))) return null;
  let year: number, month: number, day: number;
  if (typeof cell.v === "number") {
    const value = XLSX.SSF.parse_date_code(cell.v, { date1904 });
    if (!value) return null;
    [year, month, day] = [value.y, value.m, value.d];
  } else {
    const text = cellText(cell)!;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(text);
    if (iso) [year, month, day] = iso.slice(1, 4).map(Number);
    else if (us) [month, day, year] = us.slice(1, 4).map(Number);
    else return null;
  }
  if (year < 1 || year > 9999) return null;
  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result ? result : null;
}
function split(value: string | null): string[] { return value ? value.split(/\s+\/\s+|[\r\n]+/).map((part) => part.trim()) : []; }
function parseContacts(values: Record<string, string | null>, source: Source, buckets: ImportBuckets): ContactInput[] {
  const names = split(values.contactPeople), phones = split(values.contactPhones), addresses = split(values.contactEmails), roles = split(values.contactBilling);
  const mismatch = addresses.length > 0 && [names, phones, roles].some((parts) => parts.length > 0 && parts.length !== addresses.length);
  const roleAt = (index: number) => BILLING_ROLES.find((role) => role === roles[index]?.toLowerCase()) ?? (index ? "cc" : "main");
  let contacts: ContactInput[];
  if (mismatch) {
    issue(buckets, "checkContacts", source, "Packed contact counts differ; email extraction used");
    const extracted = parseEmails(values.contactEmails, source, buckets, true);
    contacts = extracted.map((email, index) => ({ emails: [email], billingRole: roles.length === extracted.length ? roleAt(index) : index ? "cc" : "main", name: names[index] || null, phones: phoneList(phones[index] || null, source, buckets) }));
  } else contacts = addresses.flatMap((address, index) => {
    const emails = parseEmails(address, source, buckets);
    return emails.length ? [{ emails, name: nullText(names[index]), phones: phoneList(phones[index] || null, source, buckets), billingRole: roleAt(index) }] : [];
  });
  const listed = new Set(contacts.flatMap((contact) => contact.emails));
  for (const email of parseEmails(values.siEmail, source, buckets)) if (!listed.has(email)) { contacts.push({ emails: [email], billingRole: "none" }); listed.add(email); }
  return contacts;
}
function valuesFor(table: Table, row: XLSX.CellObject[]): { values: Record<string, string | null>; cells: Record<string, XLSX.CellObject | undefined> } {
  const values: Record<string, string | null> = {}, cells: Record<string, XLSX.CellObject | undefined> = {};
  for (const [column, key] of table.columns) {
    const value = cellText(row[column]);
    if (values[key] && value && ["emails", "contactEmails"].includes(key)) values[key] += "\n" + value;
    else if (!values[key]) { values[key] = value; cells[key] = row[column]; }
  }
  return { values, cells };
}
function safeUrl(value: string | null, source: Source, buckets: ImportBuckets, field: string): string | null {
  if (value) try { if (new URL(value).protocol === "https:") return value; } catch { /* Flag the field without echoing its contents. */ }
  if (value) issue(buckets, "invalidValues", source, "Non-https or invalid link dropped", field);
  return null;
}
export function parseWorkbook(data: Buffer): ParsedImport {
  const result: ParsedImport = { companies: [], deptEmails: [], suppliers: [], probity: [], buckets: emptyBuckets() };
  const tables = readTables(data, result.buckets);
  for (const table of tables) {
    let department = "Other";
    for (let r = 1; r < table.cells.length; r++) {
      const row = table.cells[r] ?? [];
      if (!row.some((cell) => cellText(cell))) continue;
      const source = { sheet: table.sheet, row: table.headerRow + r };
      const { values: v, cells } = valuesFor(table, row);
      if (table.tab === "companies") {
        if (!v.name || !nameKey(v.name)) { issue(result.buckets, "invalidValues", source, "Missing registered name; row skipped", "name"); continue; }
        const company: CompanyInput = { name: v.name.replace(/\s+/g, " "), type: v.individual ? "Individual" : "Non-individual", entities: [], isNew: /\bNEW\b/i.test(v.engagementStatus ?? ""), engagement: /\bINACTIVE\b/i.test(v.engagementStatus ?? "") ? "inactive" : /\bACTIVE\b/i.test(v.engagementStatus ?? "") ? "active" : null };
        for (const key of COMPANY_TEXT_FIELDS) company[key] = v[key] ?? null;
        for (const key of COMPANY_DATE_FIELDS) {
          company[key] = parseDate(cells[key], table.date1904);
          if (v[key] && !company[key]) issue(result.buckets, "invalidValues", source, "Invalid date dropped", key);
        }
        company.entities = [...new Set((v.entities ?? "").split(",").map((value) => value.trim().toUpperCase()).filter((value): value is typeof ENTITIES[number] => {
          if (!value) return false;
          if (ENTITIES.includes(value as typeof ENTITIES[number])) return true;
          issue(result.buckets, "invalidValues", source, "Unknown intercompany value dropped", "entities"); return false;
        }))];
        if (company.tin && !TIN_RE.test(company.tin)) { issue(result.buckets, "invalidValues", source, "Invalid TIN dropped", "tin"); company.tin = null; }
        company.efps = EFPS.find((value) => value.toLowerCase() === v.efps?.toLowerCase()) ?? null;
        if (v.efps && !company.efps) issue(result.buckets, "invalidValues", source, "Unknown EFPS value dropped", "efps");
        company.gdLink = safeUrl(v.gdLink, source, result.buckets, "gdLink");
        company.siEmail = parseEmails(v.siEmail, source, result.buckets).join(", ") || null;
        company.accountNo = v.accountNo ?? null;
        const contacts = parseContacts(v, source, result.buckets);
        if (!contacts.length) issue(result.buckets, "rowsWithoutEmail", source, "Client imported without contact emails");
        result.companies.push({ ...source, company, contacts });
      } else if (table.tab === "probity") {
        if (!v.companyListed || !Object.entries(v).some(([key, value]) => key !== "companyListed" && value)) continue;
        const draftedOn = parseDate(cells.draftedOn, table.date1904);
        if (v.draftedOn && !draftedOn) issue(result.buckets, "invalidValues", source, "Invalid date dropped", "draftedOn");
        result.probity.push({ ...source, value: { companyListed: v.companyListed, contactPerson: v.contactPerson, emails: parseEmails(v.emails, source, result.buckets), service: v.service, agreementUrl: safeUrl(v.agreementUrl, source, result.buckets, "agreementUrl"), draftedOn, referenceNo: v.referenceNo, remarks: v.remarks } });
      } else if (table.tab === "suppliers") {
        const addresses = parseEmails(v.emails, source, result.buckets);
        const detailEmails = v.details?.match(EMAIL_SCAN) ?? [];
        const contactName = nullText((v.details ?? "").replace(EMAIL_SCAN, "").replace(/email\s*(?:add(?:ress)?)?\s*[:.]?/gi, "").replace(/^[\s,;:]+|[\s,;:]+$/g, ""));
        result.suppliers.push({ ...source, value: { name: v.name, particulars: v.particulars, contactName: v.contactName ?? contactName, emails: [...new Set([...addresses, ...parseEmails(detailEmails.join("\n"), source, result.buckets)])], phones: phoneList(v.phones, source, result.buckets) } });
      } else {
        const filled = row.map((cell, column) => ({ text: cellText(cell), column })).filter((cell) => cell.text);
        if (filled.length === 1 && [1, 2].includes(filled[0].column) && !filled[0].text!.includes("@")) { department = filled[0].text!; continue; }
        const addresses = parseEmails(v.emails, source, result.buckets);
        if (!v.name && !v.title && !addresses.length) continue;
        result.deptEmails.push({ ...source, value: { department: v.department ?? department, name: v.name, title: v.title, emails: addresses, sortOrder: r } });
      }
    }
  }
  return result;
}
