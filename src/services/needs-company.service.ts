import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import { contactDto } from "@/lib/dto";
import { isFreeMail } from "@/lib/normalize";
import type { CandidateItem, NeedsCompanyItem } from "@/lib/api-types";
import { findApprovedCandidate, listUnlinkedCandidates } from "@/repositories/candidates.repository";
import { findCompany, listCompanies } from "@/repositories/companies.repository";
import { insertContact, listContacts } from "@/repositories/contacts.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { assertEmailsAvailable } from "./contacts.service";
import { refreshProbityMatches } from "./probity.service";
import { emails, id, object } from "./validation.service";

export function suggestCompany(candidate: CandidateItem, companies: { id: number; name: string }[], contacts: { companyId: number; emails: string[] }[]): NeedsCompanyItem["suggestion"] {
  const domains = new Set((candidate.fields.emails?.value ?? []).map((email) => email.toLowerCase().split("@")[1]).filter((domain) => domain && !isFreeMail(domain)));
  const companyIds = new Set(contacts.filter((contact) => contact.emails.some((email) => domains.has(email.toLowerCase().split("@")[1]))).map((contact) => contact.companyId));
  const company = companies.find((company) => companyIds.has(company.id));
  return company ? { companyId: company.id, name: company.name } : null;
}
export async function getNeedsCompany(): Promise<NeedsCompanyItem[]> {
  const [candidates, companies, contacts] = await Promise.all([listUnlinkedCandidates(), listCompanies(), listContacts()]);
  return candidates.map((candidate) => ({ ...candidate, suggestion: suggestCompany(candidate, companies, contacts) }));
}
export async function attachCandidate(candidateId: number, body: unknown) {
  const companyId = id(object(body, ["companyId"]).companyId, "companyId");
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const candidate = await findApprovedCandidate(candidateId, tx);
    if (!candidate) throw new AppError(404, "Approved candidate not found");
    const addresses = emails(candidate.fields.emails?.value ?? []);
    if (!addresses.length) throw new AppError(400, "Candidate has no email addresses", "emails");
    if (!await findCompany(companyId, tx)) throw new AppError(404, "Client not found");
    await assertEmailsAvailable(addresses, companyId, tx);
    const contact = await insertContact({ companyId, emails: addresses, name: candidate.fields.name?.value ?? null, billingRole: "cc" }, tx);
    await refreshProbityMatches(tx);
    return contactDto(contact);
  });
}
