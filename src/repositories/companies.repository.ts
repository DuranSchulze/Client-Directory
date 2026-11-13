import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { companies_tb as companies, type CompanyInsert } from "@/db/schema/companies";

export async function listCompanies(ex: Executor = db) { return ex.select().from(companies).orderBy(companies.id); }
export async function findCompany(id: number, ex: Executor = db) {
  return (await ex.select().from(companies).where(eq(companies.id, id)).limit(1))[0] ?? null;
}
export async function findCompanyNameConflict(key: string, exceptId: number | undefined, ex: Executor = db) {
  return (await ex.select({ id: companies.id }).from(companies).where(and(eq(companies.nameKey, key), exceptId ? ne(companies.id, exceptId) : undefined)).limit(1))[0] ?? null;
}
export async function findCompanyTinConflict(tin: string, branch: string | null, exceptId: number | undefined, ex: Executor = db) {
  return (await ex.select({ id: companies.id }).from(companies).where(and(eq(companies.tin, tin), sql`coalesce(${companies.branchCode}, '') = ${branch ?? ""}`, exceptId ? ne(companies.id, exceptId) : undefined)).limit(1))[0] ?? null;
}
export async function insertCompany(input: CompanyInsert, ex: Executor = db) { return (await ex.insert(companies).values(input).returning())[0]; }
export async function updateCompany(id: number, input: Partial<CompanyInsert>, ex: Executor = db) {
  return (await ex.update(companies).set({ ...input, updatedAt: new Date() }).where(eq(companies.id, id)).returning())[0] ?? null;
}
