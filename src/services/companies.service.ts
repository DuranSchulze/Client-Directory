import { withTransaction, type Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { encryptAccountNo, decryptAccountNo } from "@/lib/crypto/account-no";
import { nameKey } from "@/lib/normalize";
import { companyDto, contactDto, probityDto } from "@/lib/dto";
import type { CandidateItem, CompanyPatch, ContactInput, CompanyListItem, CompanyDetail } from "@/lib/api-types";
import * as repo from "@/repositories/companies.repository";
import { listContacts } from "@/repositories/contacts.repository";
import { listLinkedCandidates } from "@/repositories/candidates.repository";
import { listProbity } from "@/repositories/probity.repository";
import { insertReveal, listReveals } from "@/repositories/reveals.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { addContactInTransaction } from "./contacts.service";
import { refreshProbityMatches } from "./probity.service";
import { gmailRollup, mergeActivity } from "./activity.service";
import { invalid, validateCompany, validateContact } from "./validation.service";

async function uniqueCompany(values: { name: string; tin: string | null; branchCode: string | null }, id: number | undefined, ex: Tx) {
  if (await repo.findCompanyNameConflict(nameKey(values.name), id, ex)) throw new AppError(409, "A client with this registered name already exists.", "name");
  if (values.tin && await repo.findCompanyTinConflict(values.tin, values.branchCode, id, ex)) throw new AppError(409, "A client with this TIN and branch already exists.", "tin");
}
function encryptedInput(input: CompanyPatch) {
  const { accountNo, ...values } = input;
  return { ...values, ...(input.name === undefined ? {} : { nameKey: nameKey(input.name) }),
    ...("accountNo" in input ? { accountNo: accountNo ? encryptAccountNo(accountNo) : null, accountNoLast4: accountNo ? accountNo.slice(-4) : null } : {}) };
}
export async function getCompanies(): Promise<CompanyListItem[]> {
  const [companies, contacts, linked, probity] = await Promise.all([repo.listCompanies(), listContacts(), listLinkedCandidates(), listProbity()]);
  const contactMap = new Map<number, ReturnType<typeof contactDto>[]>();
  for (const contact of contacts) contactMap.set(contact.companyId, [...(contactMap.get(contact.companyId) ?? []), contactDto(contact)]);
  const candidateMap = new Map<number, CandidateItem[]>();
  for (const candidate of linked) candidateMap.set(candidate.companyId, [...(candidateMap.get(candidate.companyId) ?? []), { id: candidate.id, fields: candidate.fields }]);
  const probityIds = new Set(probity.map((row) => row.companyId));
  return companies.map((company) => ({ ...companyDto(company), contacts: contactMap.get(company.id) ?? [], gmail: gmailRollup(candidateMap.get(company.id) ?? []), probity: probityIds.has(company.id) }));
}
export async function getCompany(id: number): Promise<CompanyDetail> {
  const company = await repo.findCompany(id);
  if (!company) throw new AppError(404, "Client not found");
  const [contacts, candidates, probity, reveals] = await Promise.all([listContacts(id), listLinkedCandidates(id), listProbity(), listReveals(id)]);
  return { company: companyDto(company), contacts: contacts.map(contactDto), probity: probity.filter((row) => row.companyId === id).map((row) => probityDto(row, company.name)),
    activity: mergeActivity(candidates.map(({ id, fields }) => ({ id, fields }))), reveals: reveals.map((row) => ({ userEmail: row.userEmail, at: row.at.toISOString() })) };
}
export async function createCompany(body: unknown, createdBy: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError(400, "Expected an object");
  const { contacts, ...company } = body as Record<string, unknown>;
  const input = validateCompany(company);
  if (!Array.isArray(contacts) || !contacts.length) invalid("contacts", "A new client needs a contact email");
  const parsed = contacts.map((contact) => validateContact(contact) as ContactInput);
  if (!parsed.some((contact) => contact.emails.length)) invalid("contacts", "A new client needs a contact email");
  if (parsed.filter((contact) => contact.billingRole === "main").length > 1) invalid("contacts", "Only one contact can be main");
  const main = Math.max(0, parsed.findIndex((contact) => contact.billingRole === "main"));
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    await uniqueCompany({ name: input.name!, tin: input.tin ?? null, branchCode: input.branchCode ?? null }, undefined, tx);
    const row = await repo.insertCompany({ ...encryptedInput(input), name: input.name!, nameKey: nameKey(input.name!), createdBy }, tx);
    // Insert the chosen main first; the first-contact rule then leaves all other roles intact.
    await addContactInTransaction(row.id, { ...parsed[main], billingRole: "main" }, tx);
    for (let i = 0; i < parsed.length; i++) if (i !== main) await addContactInTransaction(row.id, { ...parsed[i], billingRole: parsed[i].billingRole ?? "cc" }, tx);
    await refreshProbityMatches(tx);
    return companyDto(row);
  });
}
export async function patchCompany(id: number, body: unknown) {
  const input = validateCompany(body, true);
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const old = await repo.findCompany(id, tx);
    if (!old) throw new AppError(404, "Client not found");
    await uniqueCompany({ ...old, ...input }, id, tx);
    const saved = (await repo.updateCompany(id, encryptedInput(input), tx))!;
    await refreshProbityMatches(tx);
    return companyDto(saved);
  });
}
export async function revealAccount(id: number, userEmail: string, meta: { ip: string | null; userAgent: string | null }) {
  const company = await repo.findCompany(id);
  if (!company) throw new AppError(404, "Client not found");
  await insertReveal({ companyId: id, field: "account_no", userEmail, ...meta });
  return company.accountNo === null ? null : decryptAccountNo(company.accountNo);
}
