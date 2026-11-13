import "server-only";
import { isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { companies_tb, probity_clients_tb, suppliers_tb, dept_emails_tb } from "@/db/schema";

export async function directoryCounts(ex: Executor = db) {
  const [companies, probity, unmatched, suppliers, dept] = await Promise.all([
    ex.select({ count: sql<number>`count(*)::int` }).from(companies_tb),
    ex.select({ count: sql<number>`count(*)::int` }).from(probity_clients_tb),
    ex.select({ count: sql<number>`count(*)::int` }).from(probity_clients_tb).where(isNull(probity_clients_tb.companyId)),
    ex.select({ count: sql<number>`count(*)::int` }).from(suppliers_tb),
    ex.select({ count: sql<number>`count(*)::int` }).from(dept_emails_tb),
  ]);
  return { companies: companies[0].count, probity: probity[0].count, probityUnmatched: unmatched[0].count, suppliers: suppliers[0].count, deptEmails: dept[0].count };
}
