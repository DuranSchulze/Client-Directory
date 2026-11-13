import { withTransaction, type Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { probityDto } from "@/lib/dto";
import * as repo from "@/repositories/probity.repository";
import { findCompany, listCompanies } from "@/repositories/companies.repository";
import { listContacts } from "@/repositories/contacts.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { matchProbity } from "./probity-match";
import { validateProbity } from "./validation.service";

export async function refreshProbityMatches(ex: Tx): Promise<void> {
  const companies = await listCompanies(ex);
  const contacts = await listContacts(undefined, ex);
  for (const row of await repo.listProbity(ex)) {
    if (row.matchedBy === "manual") continue;
    const match = matchProbity(row, companies, contacts);
    if (row.companyId !== match.companyId || row.matchedBy !== match.matchedBy) await repo.updateProbity(row.id, match, ex);
  }
}
export async function getProbity() {
  const [rows, companies] = await Promise.all([repo.listProbity(), listCompanies()]);
  const names = new Map(companies.map((company) => [company.id, company.name]));
  return rows.map((row) => probityDto(row, row.companyId === null ? null : names.get(row.companyId) ?? null));
}
export async function getProbityItem(id: number) {
  const row = await repo.findProbity(id);
  if (!row) throw new AppError(404, "Probity record not found");
  return probityDto(row, row.companyId === null ? null : (await findCompany(row.companyId))?.name ?? null);
}
export async function saveProbity(body: unknown, id?: number) {
  const input = validateProbity(body, id !== undefined);
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const old = id === undefined ? null : await repo.findProbity(id, tx);
    if (id !== undefined && !old) throw new AppError(404, "Probity record not found");
    if (input.companyId != null && !await findCompany(input.companyId, tx)) throw new AppError(404, "Client not found");
    const values = { ...input, ...("companyId" in input ? { matchedBy: input.companyId === null ? null : "manual" as const } : {}) };
    const row = id === undefined ? await repo.insertProbity({ ...values, companyListed: input.companyListed! }, tx) : (await repo.updateProbity(id, values, tx))!;
    const match = matchProbity(row, await listCompanies(tx), await listContacts(undefined, tx));
    const saved = row.companyId === match.companyId && row.matchedBy === match.matchedBy ? row : (await repo.updateProbity(row.id, match, tx))!;
    return probityDto(saved, saved.companyId === null ? null : (await findCompany(saved.companyId, tx))?.name ?? null);
  });
}
