import "server-only";
import { and, arrayOverlaps, eq, ne, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { ADVISORY_LOCK } from "@/db/locks";
import { companies_tb } from "@/db/schema/companies";
import { contacts_tb } from "@/db/schema/contacts";
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
