import "server-only";
import { desc, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { master_uploads_tb, companies_tb, probity_clients_tb, suppliers_tb, dept_emails_tb } from "@/db/schema";

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

export async function lastMasterUpload(ex: Executor = db) {
  const [row] = await ex.select({ at: master_uploads_tb.uploadedAt, by: master_uploads_tb.uploadedBy, fileName: master_uploads_tb.fileName })
    .from(master_uploads_tb).orderBy(desc(master_uploads_tb.uploadedAt), desc(master_uploads_tb.id)).limit(1);
  return row ? { ...row, at: row.at.toISOString() } : null;
}
