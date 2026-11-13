import "server-only";
import { db, type Executor } from "@/db";
import { eq, getTableColumns, Param, sql } from "drizzle-orm";
import { companies_tb, contacts_tb, dept_emails_tb, suppliers_tb, probity_clients_tb } from "@/db/schema";
import { listCompanies } from "./companies.repository";
import { listContacts } from "./contacts.repository";
import { listDeptEmails } from "./dept-emails.repository";
import { listSuppliers } from "./suppliers.repository";
import { listProbity } from "./probity.repository";
import type { ImportSnapshot } from "@/lib/import/plan";
import type { SupplierInput, ProbityInput } from "@/lib/api-types";
import type { CompanyInsert } from "@/db/schema/companies";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

function fillAtWrite(column: AnyPgColumn, value: unknown) {
  const type = column.getSQLType();
  const blank = type.endsWith("[]") ? sql`cardinality(${column}) = 0` : type === "text" ? sql`${column} = ''` : sql`false`;
  return sql`CASE WHEN ${column} IS NULL OR ${blank} THEN ${new Param(value, column)} ELSE ${column} END`;
}
export async function updateImportCompany(id: number, values: CompanyInsert, ex: Executor = db) {
  const columns = getTableColumns(companies_tb);
  const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== undefined && !["id", "createdAt", "createdBy", "updatedAt", "accountNo", "accountNoLast4"].includes(key)).map(([key, value]) => {
    const column = columns[key as keyof CompanyInsert];
    if (key === "entities") return [key, sql`ARRAY(SELECT DISTINCT e FROM unnest(${column} || ${new Param(value, column)}::text[]) AS u(e))`];
    if (key === "isNew") return [key, sql`CASE WHEN ${column} = false THEN ${new Param(value, column)} ELSE ${column} END`];
    if (key === "type") return [key, sql`CASE WHEN ${column} = 'Non-individual' THEN ${new Param(value, column)} ELSE ${column} END`];
    return [key, fillAtWrite(column, value)];
  }));
  if ("accountNo" in values) {
    for (const key of ["accountNo", "accountNoLast4"] as const) changes[key] = sql`CASE WHEN ${companies_tb.accountNo} IS NULL THEN ${new Param(values[key] ?? null, columns[key])} ELSE ${columns[key]} END`;
  }
  await ex.update(companies_tb).set({ ...changes, updatedAt: new Date() }).where(eq(companies_tb.id, id));
}
export async function updateImportProbity(id: number, values: ProbityInput, ex: Executor = db) {
  const columns = getTableColumns(probity_clients_tb);
  const changes = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => [key, fillAtWrite(columns[key as keyof ProbityInput], value)]));
  await ex.update(probity_clients_tb).set({ ...changes, updatedAt: new Date() }).where(eq(probity_clients_tb.id, id));
}

export async function readImportSnapshot(ex: Executor = db): Promise<ImportSnapshot> {
  const [companies, contacts, deptEmails, suppliers, probity] = await Promise.all([listCompanies(ex), listContacts(undefined, ex), listDeptEmails(ex), listSuppliers(ex), listProbity(ex)]);
  return { companies, contacts, deptEmails, suppliers, probity };
}
export async function insertImportCompanies(values: (typeof companies_tb.$inferInsert)[], ex: Executor = db) {
  return ex.insert(companies_tb).values(values).returning();
}
export async function insertImportContacts(values: (typeof contacts_tb.$inferInsert)[], ex: Executor = db) { await ex.insert(contacts_tb).values(values); }
export async function insertImportDeptEmails(values: (typeof dept_emails_tb.$inferInsert)[], ex: Executor = db) { await ex.insert(dept_emails_tb).values(values); }
export async function insertImportSuppliers(values: (typeof suppliers_tb.$inferInsert)[], ex: Executor = db) { await ex.insert(suppliers_tb).values(values); }
export async function updateImportSupplier(id: number, values: SupplierInput, ex: Executor = db) {
  const columns = getTableColumns(suppliers_tb);
  // Supplier edits do not take the ownership lock; retain edits made after the import snapshot.
  const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const column = columns[key as keyof SupplierInput];
    const blank = key === "emails" || key === "phones" ? sql`${column} = '{}'::text[]` : sql`${column} = ''`;
    return [key, sql`CASE WHEN ${column} IS NULL OR ${blank} THEN ${new Param(value, column)} ELSE ${column} END`];
  }));
  await ex.update(suppliers_tb).set({ ...changes, updatedAt: new Date() }).where(eq(suppliers_tb.id, id));
}
export async function insertImportProbity(values: (typeof probity_clients_tb.$inferInsert)[], ex: Executor = db) { await ex.insert(probity_clients_tb).values(values); }
