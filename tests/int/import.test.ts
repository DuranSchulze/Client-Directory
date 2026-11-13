import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

describe.skipIf(!process.env.TEST_DATABASE_URL)("import persistence", () => {
  const labels: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    const { withTransaction } = await import("@/db");
    const { companies_tb, suppliers_tb, dept_emails_tb, probity_clients_tb } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (!labels.length) return;
    await withTransaction(async (tx) => {
      await tx.delete(probity_clients_tb).where(inArray(probity_clients_tb.referenceNo, labels));
      await tx.delete(companies_tb).where(inArray(companies_tb.name, labels.map((label) => `Import ${label}`)));
      await tx.delete(suppliers_tb).where(inArray(suppliers_tb.name, labels.map((label) => `Supplier ${label}`)));
      await tx.delete(dept_emails_tb).where(inArray(dept_emails_tb.department, labels.map((label) => `Dept ${label}`)));
    });
    labels.length = 0;
  }, 30000);
  function workbook(label: string): Buffer {
    const book = XLSX.utils.book_new();
    const tables: Record<string, unknown[][]> = {
      "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "COMPANY'S REGISTERED ADDRESS", "ACCOUNT NO", "Email (for SI)"], [`Import ${label}`, `client@${label}.test / staff@${label}.test`, "Sheet address", "000123456789", `si@${label}.test`]],
      "All Dept. Emails": [["Department", "Name", "Email Address"], [`Dept ${label}`, "Staff", `staff@${label}.test`], [`Dept ${label}`, null, `shared1@${label}.test`], [`Dept ${label}`, null, `shared2@${label}.test`]],
      "OPS Supplier": [["Supplier /Contractor", "Particulars", "Contact Details"], [`Supplier ${label}`, "Integration", `Vendor\nEmail Add: vendor@${label}.test`]],
      "Probity Clients": [["COMPANY", "Reference Number", "Email Address", "Date Drafted"], [`Import ${label}`, label, `client@${label}.test`, "2026-01-01"]],
    };
    for (const [name, cells] of Object.entries(tables)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(cells), name);
    return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true });
  }
  it("dry-runs without writes, commits twice without duplicates and preserves admin edits and manual matches", async () => {
    vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 5).toString("base64"));
    const label = randomUUID(); labels.push(label);
    const { importWorkbook } = await import("@/services/import.service");
    const { readImportSnapshot } = await import("@/repositories/import.repository");
    const before = await readImportSnapshot();
    const preview = await importWorkbook(workbook(label), true, "integration@example.test");
    expect("preview" in preview ? preview.preview.changes.companies.inserted : null).toBe(1);
    expect(await readImportSnapshot()).toEqual(before);
    await importWorkbook(workbook(label), false, "integration@example.test");
    const first = await readImportSnapshot();
    const company = first.companies.find((row) => row.name === `Import ${label}`)!;
    const probity = first.probity.find((row) => row.referenceNo === label)!;
    expect(company.accountNo).not.toBe("000123456789");
    expect(company.accountNoLast4).toBe("6789");
    expect(first.contacts.filter((row) => row.companyId === company.id).flatMap((row) => row.emails).sort()).toEqual([`client@${label}.test`, `si@${label}.test`].sort());
    expect(probity.companyId).toBe(company.id);
    expect(first.deptEmails.filter((row) => row.department === `Dept ${label}`).flatMap((row) => row.emails).sort()).toEqual([`staff@${label}.test`, `shared1@${label}.test`, `shared2@${label}.test`].sort());
    const { withTransaction } = await import("@/db");
    const { updateCompany } = await import("@/repositories/companies.repository");
    const { updateProbity } = await import("@/repositories/probity.repository");
    await withTransaction(async (tx) => {
      await updateCompany(company.id, { address: "Admin edited address" }, tx);
      await updateProbity(probity.id, { companyId: company.id, matchedBy: "manual", remarks: "Admin remarks" }, tx);
    });
    const edited = await readImportSnapshot();
    const second = await importWorkbook(workbook(label), false, "integration@example.test");
    expect("result" in second ? second.result.changes : null).toEqual({ companies: { inserted: 0, updated: 0 }, contacts: { inserted: 0, updated: 0 }, suppliers: { inserted: 0, updated: 0 }, deptEmails: { inserted: 0, updated: 0 }, probity: { inserted: 0, updated: 0 } });
    expect(await readImportSnapshot()).toEqual(edited);
  }, 60000);
  it("rolls every table back after an injected late failure", async () => {
    vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 5).toString("base64"));
    const label = randomUUID(); labels.push(label);
    const repo = await import("@/repositories/import.repository");
    const { importWorkbook } = await import("@/services/import.service");
    const before = await repo.readImportSnapshot();
    vi.spyOn(repo, "insertImportProbity").mockRejectedValueOnce(new Error("Injected late failure"));
    await expect(importWorkbook(workbook(label), false, "integration@example.test")).rejects.toThrow("Injected late failure");
    expect(await repo.readImportSnapshot()).toEqual(before);
  }, 60000);
});
