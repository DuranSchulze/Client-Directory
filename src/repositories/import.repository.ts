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
import type { SupplierInput } from "@/lib/api-types";

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
