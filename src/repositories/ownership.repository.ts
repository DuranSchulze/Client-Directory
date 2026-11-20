import "server-only";
import { and, arrayOverlaps, eq, ne, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { ADVISORY_LOCK } from "@/db/locks";
import { companies_tb } from "@/db/schema/companies";
import { contacts_tb } from "@/db/schema/contacts";
import { distribution_suppressions_tb } from "@/db/schema/distribution-suppressions";
import { dept_emails_tb } from "@/db/schema/dept-emails";

export async function lockEmailOwnership(ex: Executor = db) { await ex.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK})`); }
export async function findEmailOwner(emails: string[], exceptCompanyId: number | undefined, ex: Executor = db) {
  if (!emails.length) return null;
  return (await ex.select({ companyId: companies_tb.id, name: companies_tb.name }).from(contacts_tb)
    .innerJoin(companies_tb, eq(companies_tb.id, contacts_tb.companyId))
    .where(and(arrayOverlaps(contacts_tb.emails, emails), exceptCompanyId ? ne(contacts_tb.companyId, exceptCompanyId) : undefined)).limit(1))[0] ?? null;
}
export async function findDeptEmail(emails: string[], ex: Executor = db) {
  if (!emails.length) return null;
  return (await ex.select({ id: dept_emails_tb.id }).from(dept_emails_tb).where(arrayOverlaps(dept_emails_tb.emails, emails)).limit(1))[0] ?? null;
}

export async function tryDistributionLock(ex: Executor) {
  // withTransaction closes its private pool on success or rollback, releasing this session lock.
  const result = await ex.execute<{ acquired: boolean }>(sql`select pg_try_advisory_lock(7340022) as acquired`);
  return result.rows[0]?.acquired === true;
}
export async function listSuppressions(ex: Executor = db) { return ex.select().from(distribution_suppressions_tb); }
export async function suppressEmails(emails: string[], companyId: number, createdBy: string, ex: Executor) {
  if (emails.length) await ex.insert(distribution_suppressions_tb).values(emails.map((email) => ({ email, companyId, createdBy }))).onConflictDoNothing();
}
