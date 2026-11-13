import { nameKey, normEmail } from "@/lib/normalize";
import type { MatchedBy } from "@/lib/enums";

type MatchCompany = { id: number; name: string; alias: string | null; tradeName: string | null };
type MatchContact = { companyId: number; emails: string[] };
type MatchProbity = { companyListed: string; emails: string[]; companyId: number | null; matchedBy: MatchedBy | null };
export function matchProbity(row: MatchProbity, companies: MatchCompany[], contacts: MatchContact[]): { companyId: number | null; matchedBy: MatchedBy | null } {
  if (row.matchedBy === "manual") return { companyId: row.companyId, matchedBy: "manual" };
  const emails = new Set(row.emails.map(normEmail));
  const owner = contacts.find((contact) => contact.emails.some((email) => emails.has(normEmail(email))));
  if (owner) return { companyId: owner.companyId, matchedBy: "email" };
  const key = nameKey(row.companyListed);
  const company = key ? companies.find((company) => [company.name, company.alias, company.tradeName].some((name) => name && nameKey(name) === key)) : undefined;
  return company ? { companyId: company.id, matchedBy: "name" } : { companyId: null, matchedBy: null };
}
