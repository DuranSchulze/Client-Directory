import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { dept_emails_tb as dept } from "@/db/schema/dept-emails";
import { pageOrder, substringFilter, type PageWindow, type SortDirection } from "./paging";
type DeptInsert = typeof dept.$inferInsert;

export async function listDeptEmails(ex: Executor = db) { return ex.select().from(dept).orderBy(dept.department, dept.sortOrder, dept.id); }
export const DEPT_SORT_COLUMNS = { sortOrder: dept.sortOrder };
export async function listDeptEmailsPage({ limit, offset, search }: PageWindow, department: string, direction: SortDirection, ex: Executor) {
  const filter = and(
    department ? sql`split_part(${dept.department}, ' · ', 1) = ${department}` : undefined,
    substringFilter(search, [dept.department, dept.name, dept.title], [dept.emails]),
  );
  const rows = await ex.select().from(dept).where(filter)
    .orderBy(pageOrder(dept.sortOrder, direction), dept.id).limit(limit).offset(offset);
  const departments = await ex.select({ department: dept.department, count: count() }).from(dept).groupBy(dept.department)
    .orderBy(sql`min(${dept.sortOrder})`, sql`(array_agg(${dept.id} order by ${dept.sortOrder}, ${dept.id}))[1]`);
  const all = departments.reduce((sum, entry) => sum + entry.count, 0);
  const total = filter ? (await ex.select({ total: count() }).from(dept).where(filter))[0].total : all;
  return { rows, total, all, departments };
}
export async function nextDeptEmailSortOrder(ex: Executor) {
  const [row] = await ex.select({ next: sql<number>`coalesce(max(${dept.sortOrder}::bigint), 0) + 1`.mapWith(Number) }).from(dept);
  return row.next;
}
export async function findDeptEmailById(id: number, ex: Executor = db) { return (await ex.select().from(dept).where(eq(dept.id, id)).limit(1))[0] ?? null; }
export async function insertDeptEmail(input: DeptInsert, ex: Executor = db) { return (await ex.insert(dept).values(input).returning())[0]; }
export async function updateDeptEmail(id: number, input: Partial<DeptInsert>, ex: Executor = db) {
  return (await ex.update(dept).set(input).where(eq(dept.id, id)).returning())[0] ?? null;
}
