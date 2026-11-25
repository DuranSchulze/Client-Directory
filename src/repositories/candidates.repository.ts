import "server-only";
import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { ext_candidates as candidates } from "@/db/external/candidates";
import { companies_tb as companies } from "@/db/schema/companies";
import { contacts_tb as contacts } from "@/db/schema/contacts";
import { dept_emails_tb as dept } from "@/db/schema/dept-emails";
import type { InquiriesPage, Inquiry } from "@/lib/api-types";
import type { CandidateFields } from "@/lib/candidate-types";
import { pageOrder, substringFilter, type PageWindow, type SortDirection } from "./paging";

// Scraper stores `fields` as {key: {value}} but the approved `reviewed` record flat ({key: value}).
// Wrap the reviewer's edits into the field shape and lay them over `fields`, which keeps timeline, stage_dates and amounts.
const REVIEWED_KEYS = ["name", "emails", "phones", "company", "stage", "status", "services", "department", "engagement_paid",
  "first_contact", "last_contact", "client_since", "services_availed", "payments"];
const fields = sql<CandidateFields>`(${candidates.fields} || coalesce((SELECT jsonb_object_agg(key, jsonb_build_object('value', value))
  FROM jsonb_each(${candidates.reviewed}) WHERE key IN (${sql.raw(REVIEWED_KEYS.map((k) => `'${k}'`).join(", "))})
  AND NOT (jsonb_typeof(value) = 'object' AND jsonb_exists(value, 'value'))), '{}'::jsonb))`;
// Match the whitespace accepted by JavaScript normEmail().
const normalizedEmails = (value: SQL) => sql`ARRAY(SELECT lower(btrim(email, U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF')) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(${value}) = 'array' THEN ${value} ELSE '[]'::jsonb END) AS candidate_email(email) WHERE email IS NOT NULL)`;
const emails = normalizedEmails(sql`${fields}->'emails'->'value'`);
function linkedCandidates(companyId: number | undefined, ex: Executor, selectedFields = fields, addresses = emails) {
  return ex.selectDistinct({ companyId: contacts.companyId, id: candidates.id, fields: selectedFields }).from(candidates)
    .innerJoin(contacts, sql`${contacts.emails} && ${addresses}`).where(and(inArray(candidates.reviewState, ["pending", "approved"]), companyId === undefined ? undefined : eq(contacts.companyId, companyId)))
    .orderBy(candidates.id, contacts.companyId).limit(5000);
}
export async function listLinkedCandidates(companyId: number | undefined = undefined, ex: Executor = db) {
  return linkedCandidates(companyId, ex);
}
// One field with the same flat reviewed override as `fields`, without merging the timeline and other unused fields.
const effective = (key: keyof CandidateFields) => {
  const edit = sql`(${candidates.reviewed}->${key}::text)`;
  return sql`(case when ${edit} is null or (jsonb_typeof(${edit}) = 'object' and jsonb_exists(${edit}, 'value'))
    then ${candidates.fields}->${key}::text else jsonb_build_object('value', ${edit}) end)`;
};

const inquiryStates = ["pending", "approved"] satisfies Inquiry["reviewState"][];
const inquiries = and(inArray(candidates.reviewState, inquiryStates), eq(sql`${effective("status")}->>'value'`, "inquiry"));
const lastContact = sql`(${effective("last_contact")}->>'value')`;
// Scraper dates and timestamps without an offset are treated as UTC.
const lastContactWithZone = sql`(case when ${lastContact} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?)?$'
  then ${lastContact} || ' UTC' else ${lastContact} end)`;
export const INQUIRY_SORT_COLUMNS = {
  last_contact: sql`case when ${lastContact} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    and pg_input_is_valid(${lastContactWithZone}, 'timestamp with time zone') then ${lastContactWithZone}::timestamptz end`,
  name: sql`${effective("name")}->>'value'`,
  company: sql`${effective("company")}->>'value'`,
  stage: sql`${effective("stage")}->>'value'`,
};

export async function countInquiries(ex: Executor, filter?: SQL) {
  const [{ total }] = await ex.select({ total: count() }).from(candidates).where(and(inquiries, filter));
  return total;
}

export async function listInquiriesPage(
  { limit, offset, search }: PageWindow, key: keyof typeof INQUIRY_SORT_COLUMNS, direction: SortDirection, ex: Executor,
): Promise<InquiriesPage> {
  const inquiryEmails = normalizedEmails(sql`${effective("emails")}->'value'`);
  const filter = substringFilter(search, [INQUIRY_SORT_COLUMNS.name, INQUIRY_SORT_COLUMNS.company], [inquiryEmails]);
  const client = ex.select({ match: sql`jsonb_build_object('companyId', ${companies.id}, 'name', ${companies.name})` })
    .from(contacts).innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(sql`${contacts.emails} && ${inquiryEmails}`).orderBy(companies.name, companies.id).limit(1);
  const items = await ex.select({
    id: candidates.id,
    reviewState: sql<Inquiry["reviewState"]>`${candidates.reviewState}`,
    fields: sql<Inquiry["fields"]>`jsonb_build_object(
      'name', ${effective("name")}, 'company', ${effective("company")}, 'emails', ${effective("emails")},
      'stage', ${effective("stage")}, 'department', ${effective("department")}, 'services', ${effective("services")},
      'first_contact', ${effective("first_contact")}, 'last_contact', ${effective("last_contact")}
    )`,
    client: sql<Inquiry["client"]>`(${client})`,
  }).from(candidates).where(and(inquiries, filter))
    .orderBy(pageOrder(INQUIRY_SORT_COLUMNS[key], direction), candidates.id).limit(limit).offset(offset);
  const all = await countInquiries(ex);
  const total = filter ? await countInquiries(ex, filter) : all;
  return { items, total, all };
}

export async function listLinkedCandidateRollups(ex: Executor) {
  const rollupFields = sql<CandidateFields>`jsonb_build_object(
    'stage', ${effective("stage")},
    'last_contact', ${effective("last_contact")},
    'needs_check', ${candidates.fields}->'needs_check'
  )`;
  return linkedCandidates(undefined, ex, rollupFields, normalizedEmails(sql`${effective("emails")}->'value'`));
}
const unlinked = and(eq(candidates.reviewState, "approved"),
  sql`cardinality(${emails}) > 0`,
  sql`NOT EXISTS (SELECT 1 FROM ${contacts} WHERE ${contacts.emails} && ${emails})`,
  sql`NOT EXISTS (SELECT 1 FROM ${dept} WHERE ${dept.emails} && ${emails})`);

export async function listUnlinkedCandidates(ex: Executor = db) {
  return ex.select({ id: candidates.id, fields }).from(candidates).where(unlinked).orderBy(candidates.id).limit(5000);
}

/** The whole Needs-company queue in one pass, with only the fields the queue shows (same rules as `unlinked`). */
export async function listNeedsQueue(ex: Executor = db) {
  const queueEmails = normalizedEmails(sql`${effective("emails")}->'value'`);
  const queueFields = sql<CandidateFields>`jsonb_strip_nulls(jsonb_build_object(
    'name', ${effective("name")}, 'company', ${effective("company")}, 'stage', ${effective("stage")},
    'last_contact', ${effective("last_contact")}, 'emails', ${effective("emails")}))`;
  return ex.select({ id: candidates.id, fields: queueFields }).from(candidates).where(and(eq(candidates.reviewState, "approved"),
    sql`cardinality(${queueEmails}) > 0`,
    sql`NOT EXISTS (SELECT 1 FROM ${contacts} WHERE ${contacts.emails} && ${queueEmails})`,
    sql`NOT EXISTS (SELECT 1 FROM ${dept} WHERE ${dept.emails} && ${queueEmails})`)).orderBy(candidates.id);
}

export async function findApprovedCandidate(id: number, ex: Executor = db) {
  return (await ex.select({ id: candidates.id, fields }).from(candidates).where(and(eq(candidates.id, id), eq(candidates.reviewState, "approved"))).limit(1))[0] ?? null;
}

export async function listDistributable(ex: Executor = db) {
  return ex.select({ id: candidates.id, fields }).from(candidates)
    .where(inArray(candidates.reviewState, ["pending", "approved"])).orderBy(candidates.id);
}
