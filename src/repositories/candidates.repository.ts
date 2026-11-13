import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { ext_candidates as candidates } from "@/db/external/candidates";
import { contacts_tb as contacts } from "@/db/schema/contacts";
import { dept_emails_tb as dept } from "@/db/schema/dept-emails";
import type { CandidateFields } from "@/lib/candidate-types";

const fields = sql<CandidateFields>`coalesce(${candidates.reviewed}, ${candidates.fields})`;
const emails = sql`ARRAY(SELECT lower(jsonb_array_elements_text(CASE WHEN jsonb_typeof(${fields}->'emails'->'value') = 'array' THEN ${fields}->'emails'->'value' ELSE '[]'::jsonb END)))`;
export async function listLinkedCandidates(companyId: number | undefined = undefined, ex: Executor = db) {
  return ex.selectDistinct({ companyId: contacts.companyId, id: candidates.id, fields }).from(candidates)
    .innerJoin(contacts, sql`${contacts.emails} && ${emails}`).where(and(eq(candidates.reviewState, "approved"), companyId === undefined ? undefined : eq(contacts.companyId, companyId)))
    .orderBy(candidates.id, contacts.companyId).limit(5000);
}
export async function listUnlinkedCandidates(ex: Executor = db) {
  return ex.select({ id: candidates.id, fields }).from(candidates).where(and(eq(candidates.reviewState, "approved"),
    sql`NOT EXISTS (SELECT 1 FROM ${contacts} WHERE ${contacts.emails} && ${emails})`,
    sql`NOT EXISTS (SELECT 1 FROM ${dept} WHERE ${dept.emails} && ${emails})`)).orderBy(candidates.id).limit(5000);
}
export async function findApprovedCandidate(id: number, ex: Executor = db) {
  return (await ex.select({ id: candidates.id, fields }).from(candidates).where(and(eq(candidates.id, id), eq(candidates.reviewState, "approved"))).limit(1))[0] ?? null;
}
