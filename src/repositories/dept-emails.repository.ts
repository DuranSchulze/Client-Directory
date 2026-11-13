import "server-only";
import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { dept_emails_tb as dept } from "@/db/schema/dept-emails";
type DeptInsert = typeof dept.$inferInsert;

export async function listDeptEmails(ex: Executor = db) { return ex.select().from(dept).orderBy(dept.department, dept.sortOrder, dept.id); }
export async function findDeptEmailById(id: number, ex: Executor = db) { return (await ex.select().from(dept).where(eq(dept.id, id)).limit(1))[0] ?? null; }
export async function insertDeptEmail(input: DeptInsert, ex: Executor = db) { return (await ex.insert(dept).values(input).returning())[0]; }
export async function updateDeptEmail(id: number, input: Partial<DeptInsert>, ex: Executor = db) {
  return (await ex.update(dept).set(input).where(eq(dept.id, id)).returning())[0] ?? null;
}
