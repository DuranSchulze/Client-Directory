import "server-only";
import { after } from "next/server";
import { withTransaction } from "@/db";
import { encryptAccountNo } from "@/lib/crypto/account-no";
import { IMPORT_LIMITS, type ImportCommitResponse, type ImportPreviewResponse, type ImportResult } from "@/lib/import/contract";
import { parseWorkbook } from "@/lib/import/parse";
import { planImport } from "@/lib/import/plan";
import type { CompanyInsert } from "@/db/schema/companies";
import * as repo from "@/repositories/import.repository";
import { lockEmailOwnership } from "@/repositories/ownership.repository";
import { updateDeptEmail } from "@/repositories/dept-emails.repository";
import { refreshProbityMatches } from "./probity.service";
import { distributeMatches } from "./distribute.service";
import { deleteContact, updateContact } from "@/repositories/contacts.repository";
import { accountNumber } from "./companies.service";

function* chunks<T>(items: T[]): Generator<T[]> {
  for (let i = 0; i < items.length; i += IMPORT_LIMITS.chunk) yield items.slice(i, i + IMPORT_LIMITS.chunk);
}
function encrypted(values: CompanyInsert): CompanyInsert {
  if (!("accountNo" in values)) return values;
  const account = accountNumber(values.accountNo);
  return { ...values, ...account, accountNo: account.accountNo ? encryptAccountNo(account.accountNo) : null };
}
export async function importWorkbook(data: Buffer, check: boolean, userEmail: string, fileName: string, reviewedMovesKey?: string): Promise<ImportPreviewResponse | ImportCommitResponse | (ImportPreviewResponse & { movesChanged: true })> {
  const parsed = parseWorkbook(data);
  for (const row of parsed.companies) {
    try { row.company.accountNo = accountNumber(row.company.accountNo).accountNo; }
    catch {
      row.company.accountNo = null;
      parsed.buckets.invalidValues.push({ sheet: row.sheet, row: row.row, field: "accountNo", reason: "Invalid bank account number dropped" });
    }
  }
  if (check) return { preview: planImport(parsed, await repo.readImportSnapshot()).preview };
  const committed = await withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    // Replan under the shared ownership lock; a preview is never trusted as a write plan.
    const plan = planImport(parsed, await repo.readImportSnapshot(tx));
    if (reviewedMovesKey !== undefined && reviewedMovesKey !== plan.preview.movesKey) {
      return { movesChanged: true as const, preview: plan.preview };
    }
    for (const row of plan.contactUpdates) {
      if (row.emails.length) await updateContact(row.id, { emails: row.emails }, tx);
      else await deleteContact(row.id, tx);
    }
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
    for (const batch of chunks(plan.companies.filter((row) => row.id > 0))) for (const row of batch) await repo.updateImportCompany(row.id, encrypted(row.values), tx);
    for (const batch of chunks(plan.contacts)) await repo.insertImportContacts(batch.map((contact) => ({ ...contact, companyId: contact.companyId < 0 ? ids.get(contact.companyId)! : contact.companyId })), tx);
    for (const batch of chunks(plan.probity.filter((row) => row.id < 0))) await repo.insertImportProbity(batch.map((row) => row.values), tx);
    for (const batch of chunks(plan.probity.filter((row) => row.id > 0))) for (const row of batch) await repo.updateImportProbity(row.id, row.values, tx);
    await refreshProbityMatches(tx);
    const result: ImportResult = { changes: plan.preview.changes, buckets: plan.preview.buckets, probity: plan.preview.probity };
    await repo.insertMasterUpload({ fileName, uploadedBy: userEmail, summary: result.changes }, tx);
    return { result };
  });
  if ("result" in committed && process.env.AUTO_DISTRIBUTE === "1") {
    try {
      after(async () => {
        try { await distributeMatches(); }
        catch { console.error("Automatic contact distribution failed after import"); }
      });
    } catch {
      console.error("Could not schedule automatic contact distribution after import");
    }
  }
  return committed;
}
