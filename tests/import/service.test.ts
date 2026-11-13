import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { decryptAccountNo } from "@/lib/crypto/account-no";

const m = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), snapshot: vi.fn(), companies: vi.fn(), contacts: vi.fn(), dept: vi.fn(), suppliers: vi.fn(), probity: vi.fn(), refresh: vi.fn(), trace: [] as string[],
}));
vi.mock("@/db", () => ({ db: {}, withTransaction: m.transaction }));
vi.mock("@/repositories/import.repository", () => ({ readImportSnapshot: m.snapshot, insertImportCompanies: m.companies, insertImportContacts: m.contacts, insertImportDeptEmails: m.dept, insertImportSuppliers: m.suppliers, insertImportProbity: m.probity }));
vi.mock("@/repositories/ownership.repository", () => ({ lockEmailOwnership: m.lock }));
vi.mock("@/services/probity.service", () => ({ refreshProbityMatches: m.refresh }));
beforeEach(() => {
  vi.resetAllMocks(); m.trace.length = 0;
  vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 9).toString("base64"));
  m.transaction.mockImplementation(async (fn) => fn({ transaction: true }));
  m.lock.mockImplementation(async () => { m.trace.push("lock"); });
  m.snapshot.mockImplementation(async () => { m.trace.push("snapshot"); return { companies: [], contacts: [], deptEmails: [], suppliers: [], probity: [] }; });
  let nextId = 10;
  m.companies.mockImplementation(async (rows) => { m.trace.push("companies"); return rows.map((row: { nameKey: string }) => ({ id: nextId++, nameKey: row.nameKey })); });
  for (const [name, fn] of [["dept", m.dept], ["suppliers", m.suppliers], ["contacts", m.contacts], ["probity", m.probity], ["refresh", m.refresh]] as const) fn.mockImplementation(async () => { m.trace.push(name); });
});
afterEach(() => vi.unstubAllEnvs());
function workbook(): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS", "ACCOUNT NO"], ["Acme", "client@example.test", "000123456"]]), "All Clients Database");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Name", "Email Address"], ["Staff", "staff@example.test"]]), "All Dept. Emails");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Supplier /Contractor", "Particulars"], ["Vendor", "Print"]]), "OPS Supplier");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["COMPANY", "Reference Number"], ["Acme", "R1"]]), "Probity Clients");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
it("dry-run writes nothing and never includes a bank number in the preview", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  const response = await importWorkbook(workbook(), true, "admin@example.test");
  expect(response).toHaveProperty("preview");
  expect(JSON.stringify(response)).not.toContain("000123456");
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.companies).not.toHaveBeenCalled();
  expect(m.contacts).not.toHaveBeenCalled();
});
it("locks before replanning, writes in order, encrypts bank numbers and uses the transaction throughout", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  const response = await importWorkbook(workbook(), false, "admin@example.test");
  expect(m.trace).toEqual(["lock", "snapshot", "dept", "suppliers", "companies", "contacts", "probity", "refresh"]);
  expect(m.companies.mock.calls[0][0][0].accountNo).not.toBe("000123456");
  expect(decryptAccountNo(m.companies.mock.calls[0][0][0].accountNo)).toBe("000123456");
  expect(m.companies.mock.calls[0][0][0].accountNoLast4).toBe("3456");
  for (const fn of [m.snapshot, m.companies, m.contacts, m.dept, m.suppliers, m.probity]) expect(fn.mock.calls.at(-1)!.at(-1)).toEqual({ transaction: true });
  expect(m.contacts.mock.calls[0][0][0].companyId).toBe(10);
  expect(JSON.stringify(response)).not.toContain("000123456");
});
it("revalidates ownership from current database state at commit", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(workbook(), true, "admin@example.test");
  m.snapshot.mockResolvedValueOnce({ companies: [], contacts: [{ id: 1, companyId: 999, emails: ["client@example.test"], billingRole: "main" }], deptEmails: [], suppliers: [], probity: [] });
  const response = await importWorkbook(workbook(), false, "admin@example.test");
  expect(m.contacts).not.toHaveBeenCalled();
  expect("result" in response ? response.result.buckets.sharedEmails : null).toHaveLength(1);
});
it("propagates a late error so withTransaction can roll back", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  m.probity.mockRejectedValueOnce(new Error("Injected late failure"));
  await expect(importWorkbook(workbook(), false, "admin@example.test")).rejects.toThrow("Injected late failure");
  expect(m.companies).toHaveBeenCalled();
  expect(m.contacts).toHaveBeenCalled();
  expect(m.refresh).not.toHaveBeenCalled();
});
it("writes companies and contacts in batches of at most 500", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS"], ...Array.from({ length: 501 }, (_, i) => [`Client ${i}`, `client${i}@example.test`])]), "All Clients Database");
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), false, "admin@example.test");
  expect(m.companies.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1]);
  expect(m.contacts.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1]);
});
it("encrypts all digits of a numeric General-format bank account number", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS", "ACCOUNT NO"], ["Acme", "client@example.test", 123456789012]]), "All Clients Database");
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), false, "admin@example.test");
  const stored = m.companies.mock.calls[0][0][0];
  expect(decryptAccountNo(stored.accountNo)).toBe("123456789012");
  expect(stored.accountNoLast4).toBe("9012");
});
