import "server-only";
import { withTransaction } from "@/db";
import { encryptAccountNo } from "@/lib/crypto/account-no";
import { IMPORT_LIMITS, type ImportResult } from "@/lib/import/contract";
import { parseWorkbook } from "@/lib/import/parse";
import { planImport } from "@/lib/import/plan";
import type { CompanyInsert } from "@/db/schema/companies";
import * as repo from "@/repositories/import.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { updateCompany } from "@/repositories/companies.repository";
import { updateDeptEmail } from "@/repositories/dept-emails.repository";
import { updateProbity } from "@/repositories/probity.repository";
import { refreshProbityMatches } from "./probity.service";

function* chunks<T>(items: T[]): Generator<T[]> {
  for (let i = 0; i < items.length; i += IMPORT_LIMITS.chunk) yield items.slice(i, i + IMPORT_LIMITS.chunk);
}
function encrypted(values: CompanyInsert): CompanyInsert {
  if (!values.accountNo) return values;
  return { ...values, accountNo: encryptAccountNo(values.accountNo), accountNoLast4: values.accountNo.slice(-4) };
}
export async function importWorkbook(data: Buffer, check: boolean, userEmail: string) {
  const parsed = parseWorkbook(data);
  if (check) return { preview: planImport(parsed, await repo.readImportSnapshot()).preview };
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    // Replan under the shared ownership lock; a preview is never trusted as a write plan.
    const plan = planImport(parsed, await repo.readImportSnapshot(tx));
    for (const batch of chunks(plan.deptEmails.filter((row) => row.id < 0))) await repo.insertImportDeptEmails(batch.map((row) => row.values), tx);
    for (const batch of chunks(plan.deptEmails.filter((row) => row.id > 0))) for (const row of batch) await updateDeptEmail(row.id, row.values, tx);
    for (const batch of chunks(plan.suppliers.filter((row) => row.id < 0))) await repo.insertImportSuppliers(batch.map((row) => row.values), tx);
    for (const batch of chunks(plan.suppliers.filter((row) => row.id > 0))) for (const row of batch) await repo.updateImportSupplier(row.id, row.values, tx);
    const ids = new Map<number, number>();
    for (const batch of chunks(plan.companies.filter((row) => row.id < 0))) {
      const inserted = await repo.insertImportCompanies(batch.map((row) => ({ ...encrypted(row.values), createdBy: userEmail })), tx);
      const byKey = new Map(inserted.map((row) => [row.nameKey, row.id]));
      for (const row of batch) ids.set(row.id, byKey.get(row.values.nameKey)!);
    }
    for (const batch of chunks(plan.companies.filter((row) => row.id > 0))) for (const row of batch) await updateCompany(row.id, encrypted(row.values), tx);
    for (const batch of chunks(plan.contacts)) await repo.insertImportContacts(batch.map((contact) => ({ ...contact, companyId: contact.companyId < 0 ? ids.get(contact.companyId)! : contact.companyId })), tx);
    for (const batch of chunks(plan.probity.filter((row) => row.id < 0))) await repo.insertImportProbity(batch.map((row) => row.values), tx);
    for (const batch of chunks(plan.probity.filter((row) => row.id > 0))) for (const row of batch) await updateProbity(row.id, row.values, tx);
    await refreshProbityMatches(tx);
    const result: ImportResult = { changes: plan.preview.changes, buckets: plan.preview.buckets, probity: plan.preview.probity };
    return { result };
  });
}
