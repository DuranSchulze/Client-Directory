import { withTransaction, type Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { encryptAccountNo, decryptAccountNo } from "@/lib/crypto/account-no";
import { nameKey, nullText } from "@/lib/normalize";
import { daysSince, manilaDayEnd, manilaDayStart, validDay } from "@/lib/format";
import { STAGES } from "@/lib/enums";
import { companyDto, contactDto, probityDto } from "@/lib/dto";
import type { CandidateItem, CompaniesPage, CompanyPatch, ContactInput, CompanyListItem, CompanyDetail } from "@/lib/api-types";
import * as repo from "@/repositories/companies.repository";
import { listContacts } from "@/repositories/contacts.repository";
import { listLinkedCandidateRollups, listLinkedCandidates } from "@/repositories/candidates.repository";
import { listProbity, listProbityCompanyIds } from "@/repositories/probity.repository";
import { insertReveal, listReveals } from "@/repositories/reveals.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { addContactInTransaction } from "./contacts.service";
import { refreshProbityMatches } from "./probity.service";
import { gmailRollup, mergeActivity } from "./activity.service";
import { invalid, pagingParams, validateCompany, validateContact, validateSort } from "./validation.service";

async function uniqueCompany(values: { name: string; tin: string | null; branchCode: string | null }, id: number | undefined, ex: Tx) {
  if (await repo.findCompanyNameConflict(nameKey(values.name), id, ex)) throw new AppError(409, "A client with this registered name already exists.", "name");
  if (values.tin && await repo.findCompanyTinConflict(values.tin, values.branchCode, id, ex)) throw new AppError(409, "A client with this TIN and branch already exists.", "tin");
}
export function accountNumber(value: unknown): { accountNo: string | null; accountNoLast4: string | null } {
  if (value != null && typeof value !== "string") invalid("accountNo", "Enter a bank account number containing digits");
  const accountNo = (value as string | null | undefined)?.trim() || null;
  const digits = accountNo?.replace(/\D/g, "") ?? "";
  if (accountNo && (!nullText(accountNo) || !digits)) invalid("accountNo", "Enter a bank account number containing digits");
  return { accountNo, accountNoLast4: digits.slice(-4) || null };
}
function encryptedInput(input: CompanyPatch, rawAccountNo: unknown) {
  const values = { ...input };
  delete values.accountNo;
  const account = "accountNo" in input ? accountNumber(rawAccountNo) : undefined;
  return { ...values, ...(input.name === undefined ? {} : { nameKey: nameKey(input.name) }),
    ...(account ? { ...account, accountNo: account.accountNo ? encryptAccountNo(account.accountNo) : null } : {}) };
}
function companyRollups(contacts: Awaited<ReturnType<typeof listContacts>>, linked: (CandidateItem & { companyId: number })[], probity: { companyId: number | null }[]) {
  const contactMap = new Map<number, ReturnType<typeof contactDto>[]>();
  for (const contact of contacts) {
    const group = contactMap.get(contact.companyId);
    if (group) group.push(contactDto(contact)); else contactMap.set(contact.companyId, [contactDto(contact)]);
  }
  const candidateMap = new Map<number, CandidateItem[]>();
  for (const candidate of linked) {
    const group = candidateMap.get(candidate.companyId);
    if (group) group.push(candidate); else candidateMap.set(candidate.companyId, [candidate]);
  }
  const probityIds = new Set(probity.map((row) => row.companyId));
  return (id: number) => ({ contacts: contactMap.get(id) ?? [], gmail: gmailRollup(candidateMap.get(id) ?? []), probity: probityIds.has(id) });
}
export async function getCompanies(): Promise<CompanyListItem[]> {
  const [companies, contacts, linked, probity] = await Promise.all([repo.listCompanies(), listContacts(), listLinkedCandidates(), listProbity()]);
  const rollup = companyRollups(contacts, linked, probity);
  return companies.map((company) => ({ ...companyDto(company), ...rollup(company.id) }));
}

type CompanyPageInput = Omit<Awaited<ReturnType<typeof repo.listCompanyPageInputs>>[number], "createdAt"> &
  ReturnType<ReturnType<typeof companyRollups>> & { createdAt: string };
const companySort = {
  name: (c: CompanyPageInput) => c.name,
  eng: (c: CompanyPageInput) => c.engagement,
  stage: (c: CompanyPageInput) => c.gmail.stage ? STAGES.indexOf(c.gmail.stage) : null,
  ent: (c: CompanyPageInput) => c.entities.join(","),
  added: (c: CompanyPageInput) => c.createdAt,
  checked: (c: CompanyPageInput) => c.lastCheckedBilling,
  last: (c: CompanyPageInput) => c.gmail.lastContact,
};
const quickFilters = {
  check: (c: CompanyPageInput) => c.gmail.needsCheck.length > 0,
  recheck: (c: CompanyPageInput) => (daysSince(c.lastCheckedBilling) ?? Infinity) >= 90,
  tin: (c: CompanyPageInput) => !c.tin,
  probity: (c: CompanyPageInput) => c.probity,
  nogmail: (c: CompanyPageInput) => c.gmail.candidateIds.length === 0,
};

function filterCompanies(all: CompanyPageInput[], params: URLSearchParams, search: string) {
  const [status, ent, svc, sup, stage, source] = ["status", "ent", "svc", "sup", "stage", "src"].map((key) => params.get(key));
  const from = validDay(params.get("from") ?? "");
  const to = validDay(params.get("to") ?? "");
  const start = from && manilaDayStart(from), end = to && manilaDayEnd(to);
  const query = search.toLowerCase();
  return all.filter((c) => {
    const scraper = c.contacts.some((contact) => contact.source === "scraper");
    return (!status || (status === "new" ? c.isNew : c.engagement === (status === "unset" ? null : status))) &&
      (!ent || c.entities.some((entity) => entity === ent)) &&
      (!svc || c.acctgService?.trim() === svc) &&
      (!sup || c.supervisor?.trim() === sup) &&
      (!stage || c.gmail.stage === (stage === "none" ? null : stage)) &&
      (!source || (source === "master" ? !scraper && !c.probity : source === "scraper" ? scraper : source === "probity" && c.probity)) &&
      (!start || c.createdAt >= start) && (!end || c.createdAt <= end) &&
      (!query || [c.name, c.alias, c.tradeName, c.tin, c.secNo, ...c.contacts.flatMap((contact) => [contact.name, ...contact.emails, ...contact.phones])]
        .some((value) => value?.toLowerCase().includes(query)));
  });
}

function comparePageValues(a: string | number | null, b: string | number | null, descending: boolean) {
  if (a === null || a === "") return b === null || b === "" ? 0 : 1;
  if (b === null || b === "") return -1;
  const result = typeof a === "number" && typeof b === "number" ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return descending ? -result : result;
}

export async function getCompaniesPage(params: URLSearchParams): Promise<CompaniesPage> {
  const { limit, offset, search } = pagingParams(params);
  const { key, direction } = validateSort(params.get("sort"), companySort, "name");
  return withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    const companies = await repo.listCompanyPageInputs(tx);
    const rollup = companyRollups(await listContacts(undefined, tx), await listLinkedCandidateRollups(tx), await listProbityCompanyIds(tx));
    const all = companies.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), ...rollup(c.id) }));
    const base = filterCompanies(all, params, search);
    const quick = Object.entries(quickFilters);
    const chipCounts = Object.fromEntries(quick.map(([name, test]) => [name, base.filter(test).length])) as CompaniesPage["chipCounts"];
    const selected = quick.find(([name]) => name === params.get("quick"))?.[1];
    const rows = selected ? base.filter(selected) : base;
    const value = companySort[key];
    rows.sort((a, b) => comparePageValues(value(a), value(b), direction === "desc") || a.id - b.id);
    const page = rows.slice(offset, offset + limit);
    const details = page.length ? await repo.listCompaniesByIds(page.map((row) => row.id), tx) : [];
    const byId = new Map(details.map((row) => [row.id, row]));
    return {
      items: page.map(({ id, contacts, gmail, probity }) => ({ ...companyDto(byId.get(id)!), contacts, gmail, probity })),
      total: rows.length,
      all: all.length,
      kpi: {
        active: all.filter((c) => c.engagement === "active").length,
        inactive: all.filter((c) => c.engagement === "inactive").length,
        isNew: all.filter((c) => c.isNew).length,
        newActive: all.filter((c) => c.isNew && c.engagement === "active").length,
        unset: all.filter((c) => c.engagement === null).length,
      },
      chipCounts,
      facets: {
        services: [...new Set(all.flatMap((c) => c.acctgService?.trim() || []))].sort(),
        supervisors: [...new Set(all.flatMap((c) => c.supervisor?.trim() || []))].sort(),
      },
    };
  });
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
  const values = encryptedInput(input, company.accountNo);
  if (!Array.isArray(contacts) || !contacts.length) invalid("contacts", "A new client needs a contact email");
  const parsed = contacts.map((contact) => validateContact(contact) as ContactInput);
  if (!parsed.some((contact) => contact.emails.length)) invalid("contacts", "A new client needs a contact email");
  if (parsed.filter((contact) => contact.billingRole === "main").length > 1) invalid("contacts", "Only one contact can be main");
  const main = Math.max(0, parsed.findIndex((contact) => contact.billingRole === "main"));
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    await uniqueCompany({ name: input.name!, tin: input.tin ?? null, branchCode: input.branchCode ?? null }, undefined, tx);
    const row = await repo.insertCompany({ ...values, name: input.name!, nameKey: nameKey(input.name!), createdBy }, tx);
    // Insert the chosen main first; the first-contact rule then leaves all other roles intact.
    await addContactInTransaction(row.id, { ...parsed[main], billingRole: "main" }, tx);
    for (let i = 0; i < parsed.length; i++) if (i !== main) await addContactInTransaction(row.id, { ...parsed[i], billingRole: parsed[i].billingRole ?? "cc" }, tx);
    await refreshProbityMatches(tx);
    return companyDto(row);
  });
}
export async function patchCompany(id: number, body: unknown) {
  const input = validateCompany(body, true);
  const values = encryptedInput(input, (body as Record<string, unknown>).accountNo);
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const old = await repo.findCompany(id, tx);
    if (!old) throw new AppError(404, "Client not found");
    await uniqueCompany({ ...old, ...input }, id, tx);
    const saved = (await repo.updateCompany(id, values, tx))!;
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
