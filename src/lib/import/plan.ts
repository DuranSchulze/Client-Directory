import type { CompanyInsert, CompanyRow } from "@/db/schema/companies";
import type { ContactRow } from "@/db/schema/contacts";
import type { DeptEmailRow } from "@/db/schema/dept-emails";
import type { SupplierRow } from "@/db/schema/suppliers";
import type { ProbityRow } from "@/db/schema/probity-clients";
import type { ContactInput, DeptEmailInput, ProbityInput, SupplierInput } from "@/lib/api-types";
import { nameKey } from "@/lib/normalize";
import { matchProbity } from "@/services/probity-match";
import type { ParsedImport, Source } from "./parse";
import type { ImportPreview } from "./contract";

export type ImportSnapshot = { companies: CompanyRow[]; contacts: ContactRow[]; deptEmails: DeptEmailRow[]; suppliers: SupplierRow[]; probity: ProbityRow[] };
export type Write<T> = { id: number; values: T };
export type ImportPlan = {
  companies: Write<CompanyInsert>[]; contacts: (ContactInput & { companyId: number })[];
  deptEmails: Write<DeptEmailInput>[]; suppliers: Write<SupplierInput>[]; probity: Write<ProbityInput>[]; preview: ImportPreview;
};
function empty(value: unknown): boolean { return value == null || value === "" || typeof value === "object" && !(value instanceof Date) && Object.keys(value).length === 0; }
export function fillEmpty(old: object, incoming: object): Record<string, unknown> {
  const values = old as Record<string, unknown>;
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) => !empty(value) && empty(values[key])));
}
function lower(value: string | null | undefined): string { return (value ?? "").trim().toLowerCase(); }
function deptKey(value: DeptEmailInput): string {
  const name = lower(value.name);
  return JSON.stringify(name ? [value.department, name] : [value.department, null, (value.emails ?? []).map(lower).sort()]);
}
function supplierKey(value: SupplierInput): string { return JSON.stringify([lower(value.name), lower(value.particulars)]); }
function probityKey(value: ProbityInput): string { return JSON.stringify([nameKey(value.companyListed), value.referenceNo ?? null, value.draftedOn ?? null]); }
export function planImport(parsed: ParsedImport, snapshot: ImportSnapshot): ImportPlan {
  let nextId = -1;
  const buckets = structuredClone(parsed.buckets);
  const companies = new Map<string, CompanyInsert & { id: number }>(snapshot.companies.map((row) => [row.nameKey, { ...row }]));
  const companyWrites = new Map<number, CompanyInsert>();
  const dept = new Map<string, DeptEmailInput & { id: number }>(snapshot.deptEmails.map((row) => [deptKey(row), { ...row }]));
  const deptWrites = new Map<number, DeptEmailInput>();
  const suppliers = new Map<string, SupplierInput & { id: number }>(snapshot.suppliers.map((row) => [supplierKey(row), { ...row }]));
  const supplierWrites = new Map<number, SupplierInput>();
  const probity = new Map<string, ProbityInput & { id: number; matchedBy?: ProbityRow["matchedBy"] }>(snapshot.probity.map((row) => [probityKey(row), { ...row }]));
  const probityWrites = new Map<number, ProbityInput>();
  const contacts: ImportPlan["contacts"] = [];
  const owners = new Map<string, number>(snapshot.contacts.flatMap((row) => row.emails.map((email) => [lower(email), row.companyId] as const)));
  const internal = new Set([...snapshot.deptEmails.flatMap((row) => row.emails), ...parsed.deptEmails.flatMap(({ value }) => value.emails ?? [])].map(lower));
  const deptOwned = new Map(snapshot.deptEmails.flatMap((row) => row.emails.map((email) => [lower(email), row.id] as const)));
  const hasMain = new Set(snapshot.contacts.filter((row) => row.billingRole === "main").map((row) => row.companyId));
  const hasContacts = new Set(snapshot.contacts.map((row) => row.companyId));
  const flag = (bucket: keyof typeof buckets, source: Source, reason: string, field?: string) => buckets[bucket].push({ ...source, reason, ...(field ? { field } : {}) });
  for (const source of parsed.deptEmails) {
    const incoming = { ...source.value };
    const named = !!lower(incoming.name);
    const old = named ? dept.get(deptKey(incoming)) : undefined;
    if (!named && incoming.emails?.some((email) => deptOwned.has(lower(email)))) continue;
    incoming.emails = (incoming.emails ?? []).filter((email) => {
      if (owners.has(lower(email))) { flag("internalEmails", source, "Department email already belongs to a client; address skipped", "emails"); return false; }
      const owner = deptOwned.get(lower(email));
      if (owner === undefined || owner === old?.id) return true;
      flag("internalEmails", source, "Department email already belongs to another mailbox; address skipped", "emails"); return false;
    });
    if (source.value.emails?.length && !incoming.emails.length) continue;
    if (!old) {
      const id = nextId--; dept.set(deptKey(incoming), { ...incoming, id }); deptWrites.set(id, incoming);
      for (const email of incoming.emails) deptOwned.set(lower(email), id);
    } else {
      const changes = fillEmpty(old, incoming);
      const emails = [...new Set([...(old.emails ?? []), ...incoming.emails])];
      if (emails.length !== (old.emails ?? []).length) changes.emails = emails;
      for (const email of emails) deptOwned.set(lower(email), old.id);
      if (Object.keys(changes).length) { Object.assign(old, changes); deptWrites.set(old.id, { ...deptWrites.get(old.id), ...changes, department: old.department }); }
    }
  }
  for (const { value } of parsed.suppliers) {
    const key = supplierKey(value), old = suppliers.get(key);
    if (!old) { const id = nextId--; suppliers.set(key, { ...value, id }); supplierWrites.set(id, { ...value }); }
    else {
      const changes = fillEmpty(old, value);
      if (Object.keys(changes).length) { Object.assign(old, changes); supplierWrites.set(old.id, { ...supplierWrites.get(old.id), ...changes }); }
    }
  }
  const spellings = new Map<string, string>();
  const tins = new Map(snapshot.companies.filter((row) => row.tin).map((row) => [JSON.stringify([row.tin, row.branchCode ?? ""]), row.id]));
  for (const source of parsed.companies) {
    const input = source.company, key = nameKey(input.name);
    if (spellings.has(key) && spellings.get(key) !== input.name) flag("mergedSpellings", source, "Same normalized name; later row fills empty fields", "name");
    if (!spellings.has(key)) spellings.set(key, input.name);
    let current = companies.get(key);
    const changes: Record<string, unknown> = current ? fillEmpty(current, input) : { ...input, nameKey: key };
    if (current) {
      if (input.isNew && !current.isNew) changes.isNew = true;
      if (current.type === "Non-individual" && input.type === "Individual") changes.type = "Individual";
      const entities = [...new Set([...(current.entities ?? []), ...(input.entities ?? [])])];
      if (entities.length !== (current.entities ?? []).length) changes.entities = entities;
    }
    const tin = (changes.tin ?? current?.tin) as string | null | undefined;
    const branch = (changes.branchCode ?? current?.branchCode ?? "") as string;
    const tinKey = JSON.stringify([tin, branch]);
    if (tin && tins.has(tinKey) && tins.get(tinKey) !== current?.id) {
      flag("invalidValues", source, "TIN and branch already belong to another client; conflicting field skipped", "tin");
      if (current?.tin) delete changes.branchCode;
      else if (current) delete changes.tin;
      else changes.tin = null;
    }
    if (!current) {
      const id = nextId--;
      current = { ...changes, id, name: input.name, nameKey: key, type: input.type ?? "Non-individual", entities: input.entities ?? [], isNew: input.isNew ?? false } as CompanyInsert & { id: number };
      companies.set(key, current);
      companyWrites.set(id, { ...current, id: undefined });
    } else if (Object.keys(changes).length) {
      if (current.tin) tins.delete(JSON.stringify([current.tin, current.branchCode ?? ""]));
      Object.assign(current, changes);
      companyWrites.set(current.id, { ...companyWrites.get(current.id), ...changes, name: current.name, nameKey: key });
    }
    if (current.tin) tins.set(JSON.stringify([current.tin, current.branchCode ?? ""]), current.id);
    for (const contact of source.contacts) {
      const emails = contact.emails.filter((email) => {
        email = lower(email);
        if (internal.has(email)) { flag("internalEmails", source, "Internal email excluded from client contacts", "emails"); return false; }
        const owner = owners.get(email);
        if (owner !== undefined) {
          if (owner !== current!.id) flag("sharedEmails", source, "Email already belongs to another client; later occurrence skipped", "emails");
          return false;
        }
        owners.set(email, current!.id); return true;
      });
      if (!emails.length) continue;
      let billingRole = contact.billingRole ?? "none";
      if (billingRole === "main") { if (hasMain.has(current.id)) billingRole = "cc"; else hasMain.add(current.id); }
      contacts.push({ ...contact, emails, companyId: current.id, billingRole });
      hasContacts.add(current.id);
    }
    if (!hasContacts.has(current.id) && !buckets.rowsWithoutEmail.some((issue) => issue.sheet === source.sheet && issue.row === source.row)) flag("rowsWithoutEmail", source, "Client imported without available contact emails");
  }
  const importedProbity = new Set<string>();
  for (const { value } of parsed.probity) {
    const key = probityKey(value), old = probity.get(key);
    importedProbity.add(key);
    if (!old) { const id = nextId--; probity.set(key, { ...value, id }); probityWrites.set(id, { ...value }); }
    else {
      const changes = fillEmpty(old, value);
      if (Object.keys(changes).length) { Object.assign(old, changes); probityWrites.set(old.id, { ...probityWrites.get(old.id), ...changes, companyListed: old.companyListed }); }
    }
  }
  const matches = { matched: 0, notFound: 0 };
  const matchCompanies = [...companies.values()].map((row) => ({ id: row.id, name: row.name, alias: row.alias ?? null, tradeName: row.tradeName ?? null }));
  const matchContacts = [...snapshot.contacts, ...contacts];
  for (const key of importedProbity) {
    const row = probity.get(key)!;
    const match = matchProbity({ ...row, emails: row.emails ?? [], companyId: row.companyId ?? null, matchedBy: row.matchedBy ?? null }, matchCompanies, matchContacts);
    if (match.companyId === null) matches.notFound++; else matches.matched++;
  }
  const writes = <T>(map: Map<number, T>): Write<T>[] => [...map].map(([id, values]) => ({ id, values }));
  const plan = { companies: writes(companyWrites), contacts, deptEmails: writes(deptWrites), suppliers: writes(supplierWrites), probity: writes(probityWrites) };
  const count = (rows: { id: number }[]) => ({ inserted: rows.filter((row) => row.id < 0).length, updated: rows.filter((row) => row.id > 0).length });
  return { ...plan, preview: { rows: { companies: parsed.companies.length, contacts: parsed.companies.reduce((n, row) => n + row.contacts.length, 0), suppliers: parsed.suppliers.length, deptEmails: parsed.deptEmails.length, probity: parsed.probity.length }, companies: spellings.size,
    changes: { companies: count(plan.companies), contacts: { inserted: contacts.length, updated: 0 }, suppliers: count(plan.suppliers), deptEmails: count(plan.deptEmails), probity: count(plan.probity) }, buckets, probity: matches } };
}
