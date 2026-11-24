import "server-only";
import { count, eq, isNotNull, isNull } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { companies_tb as companies } from "@/db/schema/companies";
import { probity_clients_tb as probity } from "@/db/schema/probity-clients";
import { pageOrder, substringFilter, type PageWindow, type SortDirection } from "./paging";
type ProbityInsert = typeof probity.$inferInsert;

export async function listProbity(ex: Executor = db) { return ex.select().from(probity).orderBy(probity.id); }
export function listProbityCompanyIds(ex: Executor) {
  return ex.selectDistinct({ companyId: probity.companyId }).from(probity).where(isNotNull(probity.companyId));
}
export const PROBITY_SORT_COLUMNS = {
  company: probity.companyListed, listed: probity.companyListed, match: isNull(probity.companyId),
  ref: probity.referenceNo, drafted: probity.draftedOn,
};
export async function listProbityPage({ limit, offset, search }: PageWindow, key: keyof typeof PROBITY_SORT_COLUMNS, direction: SortDirection, ex: Executor) {
  const filter = substringFilter(search, [probity.companyListed, companies.name, probity.contactPerson, probity.referenceNo, probity.remarks], [probity.emails]);
  const linked = eq(probity.companyId, companies.id);
  const rows = await ex.select({ row: probity, companyName: companies.name }).from(probity).leftJoin(companies, linked)
    .where(filter).orderBy(pageOrder(PROBITY_SORT_COLUMNS[key], direction), probity.id).limit(limit).offset(offset);
  const [{ all, matched }] = await ex.select({ all: count(), matched: count(probity.companyId) }).from(probity);
  const total = filter ? (await ex.select({ total: count() }).from(probity).leftJoin(companies, linked).where(filter))[0].total : all;
  return { rows, total, all, matched };
}
export async function findProbity(id: number, ex: Executor = db) { return (await ex.select().from(probity).where(eq(probity.id, id)).limit(1))[0] ?? null; }
export async function insertProbity(input: ProbityInsert, ex: Executor = db) { return (await ex.insert(probity).values(input).returning())[0]; }
export async function updateProbity(id: number, input: Partial<ProbityInsert>, ex: Executor = db) {
  return (await ex.update(probity).set({ ...input, updatedAt: new Date() }).where(eq(probity.id, id)).returning())[0] ?? null;
}
