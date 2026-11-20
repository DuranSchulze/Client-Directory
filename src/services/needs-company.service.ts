import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import { contactDto } from "@/lib/dto";
import { EMAIL_RE, isFreeMail, normEmail } from "@/lib/normalize";
import type { CandidateItem, NeedsCompanyItem } from "@/lib/api-types";
import { findApprovedCandidate, listUnlinkedCandidates } from "@/repositories/candidates.repository";
import { findCompany, listCompanies } from "@/repositories/companies.repository";
import { deleteContact, findContact, insertContact, listContacts } from "@/repositories/contacts.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { assertEmailsAvailable } from "./contacts.service";
import { refreshProbityMatches } from "./probity.service";
import { emails, id, object } from "./validation.service";

export function domainCompanies(domains: Set<string>, contacts: { companyId: number; emails: string[] }[]) {
  return new Set(contacts.filter((contact) => contact.emails.some((email) => domains.has(email.toLowerCase().split("@")[1]))).map((contact) => contact.companyId));
}
export function suggestCompany(candidate: CandidateItem, companies: { id: number; name: string }[], contacts: { companyId: number; emails: string[] }[]): NeedsCompanyItem["suggestion"] {
  const domains = new Set((candidate.fields.emails?.value ?? []).map((email) => email.toLowerCase().split("@")[1]).filter((domain) => domain && !isFreeMail(domain)));
  const companyIds = domainCompanies(domains, contacts);
  const company = companies.find((company) => companyIds.has(company.id));
  return company ? { companyId: company.id, name: company.name } : null;
}
export async function getNeedsCompany(): Promise<NeedsCompanyItem[]> {
  const [candidates, companies, contacts] = await Promise.all([listUnlinkedCandidates(), listCompanies(), listContacts()]);
  return candidates.map((candidate) => ({ ...candidate, suggestion: suggestCompany(candidate, companies, contacts) }));
}
type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];
const validEmails = (raw: unknown) => emails(Array.isArray(raw) ? raw.filter((email): email is string => typeof email === "string" && EMAIL_RE.test(normEmail(email))).map(normEmail) : []);

async function attachIn(tx: Tx, candidate: CandidateItem, companyId: number, addresses: string[]) {
  await assertEmailsAvailable(addresses, undefined, tx);
  return insertContact({ companyId, emails: addresses, name: candidate.fields.name?.value ?? null, billingRole: "cc" }, tx);
}
export async function attachCandidate(candidateId: number, body: unknown) {
  const companyId = id(object(body, ["companyId"]).companyId, "companyId");
  return withTransaction(async (tx) => {
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
  return withTransaction(async (tx) => {
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
}
/** Undo an attach: delete the contacts it created, so the candidates return to the queue. Not the guarded delete, which refuses a client's last contact. */
export async function undoAttach(body: unknown) {
  const raw = object(body, ["contacts"]).contacts;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) throw new AppError(400, "Nothing to undo", "contacts");
  const targets = raw.map((c) => { const o = object(c, ["id", "companyId"]); return { id: id(o.id, "id"), companyId: id(o.companyId, "companyId") }; });
  return withTransaction(async (tx) => {
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
}
