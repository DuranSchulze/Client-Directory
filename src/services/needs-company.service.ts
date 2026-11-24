import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import { contactDto } from "@/lib/dto";
import { EMAIL_RE, isFreeMail, normEmail } from "@/lib/normalize";
import type { CandidateItem, NeedsCompanyItem, NeedsCompanyPage } from "@/lib/api-types";
import { findApprovedCandidate, listNeedsQueue, listUnlinkedCandidates } from "@/repositories/candidates.repository";
import { findCompany, listCompanies } from "@/repositories/companies.repository";
import { deleteContact, findContact, insertContact, listContacts } from "@/repositories/contacts.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { assertEmailsAvailable } from "./contacts.service";
import { refreshProbityMatches } from "./probity.service";
import { invalidateCompanyRollupCache, readNeedsQueueCache, writeCompanyRollups, type NeedsQueue } from "./company-rollup-cache";
import { emails, id, object, validatePaging } from "./validation.service";

const emailDomain = (email: string) => email.toLowerCase().split("@")[1];

export function domainCompanies(domains: Set<string>, contacts: { companyId: number; emails: string[] }[]) {
  return new Set(contacts.filter((contact) => contact.emails.some((email) => domains.has(emailDomain(email)))).map((contact) => contact.companyId));
}
export function suggestCompany(candidate: CandidateItem, companies: { id: number; name: string }[], contacts: { companyId: number; emails: string[] }[]): NeedsCompanyItem["suggestion"] {
  const domains = new Set((candidate.fields.emails?.value ?? []).map(emailDomain).filter((domain) => domain && !isFreeMail(domain)));
  const companyIds = domainCompanies(domains, contacts);
  const company = companies.find((company) => companyIds.has(company.id));
  return company ? { companyId: company.id, name: company.name } : null;
}
/** The whole queue with suggestions, built in one read and kept by the 60 s cache; writes that change it clear the cache. */
async function buildNeedsQueue(): Promise<NeedsQueue> {
  const [queue, companies, contacts] = await withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    return Promise.all([listNeedsQueue(tx), listCompanies(tx), listContacts(undefined, tx)]);
  });
  // Same pick as suggestCompany (first client in list order that owns a contact on one of the domains), indexed once instead of per row.
  const rank = new Map(companies.map((company, index) => [company.id, index]));
  const byDomain = new Map<string, Set<number>>();
  for (const contact of contacts) {
    for (const domain of new Set(contact.emails.map(emailDomain))) {
      if (!domain) continue;
      const ids = byDomain.get(domain) ?? new Set<number>();
      ids.add(contact.companyId);
      byDomain.set(domain, ids);
    }
  }
  const contactDomains = new Set([...byDomain].filter(([domain, ids]) => !isFreeMail(domain) && [...ids].some((id) => rank.has(id))).map(([domain]) => domain));
  const items = queue.map((candidate): NeedsCompanyItem => {
    const addresses = (candidate.fields.emails?.value ?? []).filter((email): email is string => typeof email === "string");
    let best: number | undefined;
    for (const domain of new Set(addresses.map(emailDomain))) {
      if (!domain || isFreeMail(domain)) continue;
      for (const id of byDomain.get(domain) ?? []) {
        const at = rank.get(id);
        if (at !== undefined && (best === undefined || at < best)) best = at;
      }
    }
    return { ...candidate, suggestion: best === undefined ? null : { companyId: companies[best].id, name: companies[best].name } };
  });
  const suggested = items.filter((item) => (item.fields.emails?.value ?? []).some((email) => typeof email === "string" && contactDomains.has(emailDomain(email)))).length;
  return { items, suggested };
}

/** Literal, case-insensitive match on name, company or any email, as the old SQL strpos search. */
export function matchesQueueSearch(item: NeedsCompanyItem, search: string) {
  const needle = search.toLowerCase();
  const f = item.fields;
  return [f.name?.value, f.company?.value].some((v) => typeof v === "string" && v.toLowerCase().includes(needle))
    || (f.emails?.value ?? []).some((email) => typeof email === "string" && normEmail(email).includes(needle));
}

/** The cached whole queue; the counts badge reads it too, so neither runs its own scan. */
export const getNeedsQueue = () => readNeedsQueueCache(buildNeedsQueue);

export async function getNeedsCompany(params: Parameters<typeof validatePaging>[0]): Promise<NeedsCompanyPage> {
  const { limit, offset, search } = validatePaging(params);
  const { items, suggested } = await getNeedsQueue();
  const rows = search ? items.filter((item) => matchesQueueSearch(item, search)) : items;
  return { items: rows.slice(offset, offset + limit), total: rows.length, suggested };
}
type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];
const validEmails = (raw: unknown) => emails(Array.isArray(raw) ? raw.filter((email): email is string => typeof email === "string" && EMAIL_RE.test(normEmail(email))).map(normEmail) : []);

async function attachIn(tx: Tx, candidate: CandidateItem, companyId: number, addresses: string[]) {
  await assertEmailsAvailable(addresses, undefined, tx);
  return insertContact({ companyId, emails: addresses, name: candidate.fields.name?.value ?? null, billingRole: "cc" }, tx);
}
export async function attachCandidate(candidateId: number, body: unknown) {
  const companyId = id(object(body, ["companyId"]).companyId, "companyId");
  return writeCompanyRollups(async (tx) => {
    await lockEmailOwnership(tx);
    const candidate = await findApprovedCandidate(candidateId, tx);
    if (!candidate) throw new AppError(404, "Approved candidate not found");
    const addresses = validEmails(candidate.fields.emails?.value);
    if (!addresses.length) throw new AppError(400, "Candidate has no email addresses", "emails");
    if (!await findCompany(companyId, tx)) throw new AppError(404, "Client not found");
    const contact = await attachIn(tx, candidate, companyId, addresses);
    await refreshProbityMatches(tx);
    return contactDto(contact);
  });
}
/** Attach every queued candidate that has a same-domain suggestion to its suggested client. Others are left in the queue. All or nothing. */
export async function attachAll() {
  const result = await withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const [candidates, companies, contacts] = await Promise.all([listUnlinkedCandidates(tx), listCompanies(tx), listContacts(undefined, tx)]);
    const taken = new Set<string>();
    const created: { id: number; companyId: number }[] = [];
    for (const candidate of candidates) {
      const suggestion = suggestCompany(candidate, companies, contacts);
      const addresses = validEmails(candidate.fields.emails?.value).filter((e) => !taken.has(e));
      if (!suggestion || !addresses.length) continue;
      const contact = await attachIn(tx, candidate, suggestion.companyId, addresses);
      addresses.forEach((e) => taken.add(e));
      created.push({ id: contact.id, companyId: contact.companyId });
    }
    if (created.length) await refreshProbityMatches(tx);
    return { attached: created.length, skipped: candidates.length - created.length, contacts: created };
  });
  if (result.attached) invalidateCompanyRollupCache();
  return result;
}
/** Undo an attach: delete the contacts it created, so the candidates return to the queue. Not the guarded delete, which refuses a client's last contact. */
export async function undoAttach(body: unknown) {
  const raw = object(body, ["contacts"]).contacts;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) throw new AppError(400, "Nothing to undo", "contacts");
  const targets = raw.map((c) => { const o = object(c, ["id", "companyId"]); return { id: id(o.id, "id"), companyId: id(o.companyId, "companyId") }; });
  const result = await withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    let removed = 0;
    for (const t of targets) {
      if (!await findContact(t.companyId, t.id, tx)) continue;
      await deleteContact(t.id, tx);
      removed++;
    }
    if (removed) await refreshProbityMatches(tx);
    return { removed };
  });
  if (result.removed) invalidateCompanyRollupCache();
  return result;
}
