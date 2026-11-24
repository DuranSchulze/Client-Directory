import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { decryptAccountNo } from "@/lib/crypto/account-no";

const m = vi.hoisted(() => ({
  afterResponse: vi.fn<(callback: () => Promise<void>) => void>(), updateContact: vi.fn(), deleteContact: vi.fn(), distribute: vi.fn(), log: vi.fn(), transaction: vi.fn(), lock: vi.fn(), snapshot: vi.fn(), companies: vi.fn(), contacts: vi.fn(), dept: vi.fn(), suppliers: vi.fn(), probity: vi.fn(), updateCompany: vi.fn(), updateProbity: vi.fn(), updateSupplier: vi.fn(), refresh: vi.fn(), trace: [] as string[],
}));
vi.mock("next/server", () => ({ after: m.afterResponse }));
vi.mock("@/repositories/contacts.repository", () => ({ updateContact: m.updateContact, deleteContact: m.deleteContact }));
vi.mock("@/services/distribute.service", () => ({ distributeMatches: m.distribute }));
vi.mock("@/db", () => ({ db: {}, withTransaction: m.transaction }));
vi.mock("@/repositories/import.repository", () => ({ insertMasterUpload: m.log, readImportSnapshot: m.snapshot, insertImportCompanies: m.companies, insertImportContacts: m.contacts, insertImportDeptEmails: m.dept, insertImportSuppliers: m.suppliers, insertImportProbity: m.probity, updateImportCompany: m.updateCompany, updateImportProbity: m.updateProbity, updateImportSupplier: m.updateSupplier }));
vi.mock("@/repositories/ownership.repository", () => ({ lockEmailOwnership: m.lock }));
vi.mock("@/services/probity.service", () => ({ refreshProbityMatches: m.refresh }));
beforeEach(() => {
  vi.resetAllMocks(); m.trace.length = 0;
  vi.stubEnv("AUTO_DISTRIBUTE", "");
  vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 9).toString("base64"));
  m.transaction.mockImplementation(async (fn) => fn({ transaction: true }));
  m.lock.mockImplementation(async () => { m.trace.push("lock"); });
  m.snapshot.mockImplementation(async () => { m.trace.push("snapshot"); return { companies: [], contacts: [], deptEmails: [], suppliers: [], probity: [] }; });
  let nextId = 10;
  m.companies.mockImplementation(async (rows) => { m.trace.push("companies"); return rows.map((row: { nameKey: string }) => ({ id: nextId++, nameKey: row.nameKey })); });
  for (const [name, fn] of [["dept", m.dept], ["suppliers", m.suppliers], ["contacts", m.contacts], ["probity", m.probity], ["refresh", m.refresh]] as const) fn.mockImplementation(async () => { m.trace.push(name); });
});
afterEach(() => vi.unstubAllEnvs());
function workbook(accountNo: unknown = "000123456"): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS", "ACCOUNT NO"], ["Acme", "client@example.test", accountNo]]), "All Clients Database");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Name", "Email Address"], ["Staff", "staff@example.test"]]), "All Dept. Emails");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Supplier /Contractor", "Particulars"], ["Vendor", "Print"]]), "OPS Supplier");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["COMPANY", "Reference Number", "Service"], ["Acme", "R1", "Sheet service"]]), "Probity Clients");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
it("dry-run writes nothing and never includes a bank number in the preview", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  const response = await importWorkbook(workbook(), true, "admin@example.test", "synthetic.xlsx");
  expect(response).toHaveProperty("preview");
  expect(JSON.stringify(response)).not.toContain("000123456");
  expect(m.log).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.companies).not.toHaveBeenCalled();
  expect(m.contacts).not.toHaveBeenCalled();
});
it("uses import-only guarded updates for existing companies and probity", async () => {
  m.snapshot.mockResolvedValue({ companies: [{ id: 5, name: "Acme", nameKey: "acme", type: "Non-individual", entities: [], isNew: false, accountNo: null }], contacts: [], deptEmails: [], suppliers: [],
    probity: [{ id: 6, companyListed: "Acme", referenceNo: "R1", draftedOn: null, emails: [], companyId: null, matchedBy: null, service: null }] });
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(workbook("12-3"), false, "admin@example.test", "synthetic.xlsx");
  expect(m.companies).not.toHaveBeenCalled();
  expect(m.updateCompany).toHaveBeenCalledWith(5, expect.objectContaining({ accountNoLast4: "123" }), { transaction: true });
  expect(decryptAccountNo(m.updateCompany.mock.calls[0][1].accountNo)).toBe("12-3");
  expect(m.updateProbity).toHaveBeenCalledWith(6, expect.objectContaining({ service: "Sheet service" }), { transaction: true });
});
it.each(["N/A", "na", "-", "tBd", "#REF!", "no digits"])("drops and flags invalid imported account %s in preview and commit", async (value) => {
  const { importWorkbook } = await import("@/services/import.service");
  const preview = await importWorkbook(workbook(value), true, "admin@example.test", "synthetic.xlsx");
  expect("preview" in preview && preview.preview.buckets.invalidValues).toEqual([expect.objectContaining({ field: "accountNo" })]);
  const result = await importWorkbook(workbook(value), false, "admin@example.test", "synthetic.xlsx");
  expect("result" in result && result.result.buckets.invalidValues).toEqual([expect.objectContaining({ field: "accountNo" })]);
  expect(m.companies.mock.calls[0][0][0]).toMatchObject({ accountNo: null, accountNoLast4: null });
});
it.each([[" 12-345 (67) ", "12-345 (67)", "4567"], ["1-2", "1-2", "12"], [" ", null, null], [null, null, null]])("normalizes imported account %s without encrypting blanks", async (value, normalized, last4) => {
  const { importWorkbook } = await import("@/services/import.service");
  const result = await importWorkbook(workbook(value), false, "admin@example.test", "synthetic.xlsx");
  const stored = m.companies.mock.calls[0][0][0];
  expect(stored.accountNoLast4).toBe(last4);
  expect(stored.accountNo ? decryptAccountNo(stored.accountNo) : null).toBe(normalized);
  expect("result" in result && result.result.buckets.invalidValues).toEqual([]);
});
it("locks before replanning, writes in order, encrypts bank numbers and uses the transaction throughout", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  const { invalidateCompanyRollupCache, readCompanyRollupCache } = await import("@/services/company-rollup-cache");
  invalidateCompanyRollupCache();
  const build = vi.fn(async () => []);
  await readCompanyRollupCache(build);
  const response = await importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx");
  await readCompanyRollupCache(build);
  expect(build).toHaveBeenCalledTimes(2);
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
  await importWorkbook(workbook(), true, "admin@example.test", "synthetic.xlsx");
  m.snapshot.mockResolvedValueOnce({ companies: [], contacts: [{ id: 1, companyId: 999, emails: ["client@example.test"], billingRole: "main" }], deptEmails: [], suppliers: [], probity: [] });
  const response = await importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx");
  expect(m.contacts).not.toHaveBeenCalled();
  expect("result" in response ? response.result.buckets.sharedEmails : null).toHaveLength(1);
});
it("propagates a late error so withTransaction can roll back", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  m.probity.mockRejectedValueOnce(new Error("Injected late failure"));
  await expect(importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx")).rejects.toThrow("Injected late failure");
  expect(m.companies).toHaveBeenCalled();
  expect(m.contacts).toHaveBeenCalled();
  expect(m.refresh).not.toHaveBeenCalled();
  expect(m.log).not.toHaveBeenCalled();
});
it("writes companies and contacts in batches of at most 500", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS"], ...Array.from({ length: 501 }, (_, i) => [`Client ${i}`, `client${i}@example.test`])]), "All Clients Database");
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), false, "admin@example.test", "synthetic.xlsx");
  expect(m.companies.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1]);
  expect(m.contacts.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1]);
});
it("encrypts all digits of a numeric General-format bank account number", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS", "ACCOUNT NO"], ["Acme", "client@example.test", 123456789012]]), "All Clients Database");
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), false, "admin@example.test", "synthetic.xlsx");
  const stored = m.companies.mock.calls[0][0][0];
  expect(decryptAccountNo(stored.accountNo)).toBe("123456789012");
  expect(stored.accountNoLast4).toBe("9012");
});

it("logs exactly one changes summary using the commit transaction, including empty commits", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS"]]), "All Clients Database");
  const { importWorkbook } = await import("@/services/import.service");
  const response = await importWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), false, "admin@example.test", "empty.xlsx");
  if (!("result" in response)) throw new Error("Expected committed import");
  expect(m.log).toHaveBeenCalledTimes(1);
  expect(m.log).toHaveBeenCalledWith({ fileName: "empty.xlsx", uploadedBy: "admin@example.test", summary: response.result.changes }, { transaction: true });
  expect(Object.values(response.result.changes).every((c) => c.inserted === 0 && c.updated === 0)).toBe(true);
});

it("returns the committed result before starting distribution and logs a later failure", async () => {
  vi.stubEnv("AUTO_DISTRIBUTE", "1");
  m.transaction.mockImplementation(async (fn) => { const result = await fn({ transaction: true }); m.trace.push("committed"); return result; });
  m.distribute.mockImplementation(async () => { m.trace.push("distribution"); throw new Error("Failed distribution"); });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { importWorkbook } = await import("@/services/import.service");
    const response = await importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx");
    expect(response).toHaveProperty("result");
    expect(m.trace.at(-1)).toBe("committed");
    expect(m.afterResponse).toHaveBeenCalledTimes(1);
    expect(m.distribute).not.toHaveBeenCalled();
    await m.afterResponse.mock.calls[0][0]();
    expect(m.trace.slice(-2)).toEqual(["committed", "distribution"]);
    expect(log).toHaveBeenCalledWith("Automatic contact distribution failed after import");
    expect(m.log).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});
it("does not trigger distribution for preview, rollback or default-off commits", async () => {
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx");
  vi.stubEnv("AUTO_DISTRIBUTE", "1");
  await importWorkbook(workbook(), true, "admin@example.test", "synthetic.xlsx");
  m.probity.mockRejectedValueOnce(new Error("Rollback"));
  await expect(importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx")).rejects.toThrow("Rollback");
  expect(m.afterResponse).not.toHaveBeenCalled();
  expect(m.distribute).not.toHaveBeenCalled();
});

it.each([{ remaining: ["keep@other.test"] }, { remaining: [] }])("applies Excel moves before contact inserts; preserves remaining emails %j", async ({ remaining }) => {
  m.snapshot.mockResolvedValue({ companies: [], contacts: [{ id: 8, companyId: 99, emails: ["client@example.test", ...remaining], source: "scraper", billingRole: "cc" }], deptEmails: [], suppliers: [], probity: [] });
  const { importWorkbook } = await import("@/services/import.service");
  await importWorkbook(workbook(), true, "admin@example.test", "synthetic.xlsx");
  expect(m.updateContact).not.toHaveBeenCalled(); expect(m.deleteContact).not.toHaveBeenCalled();
  await importWorkbook(workbook(), false, "admin@example.test", "synthetic.xlsx");
  const changed = remaining.length ? m.updateContact : m.deleteContact;
  if (remaining.length) expect(m.updateContact).toHaveBeenCalledWith(8, { emails: remaining }, { transaction: true });
  else expect(m.deleteContact).toHaveBeenCalledWith(8, { transaction: true });
  expect(changed.mock.invocationCallOrder[0]).toBeLessThan(m.contacts.mock.invocationCallOrder[0]);
});

it("returns a fresh preview without writes when distribution creates an unreviewed move", async () => {
  vi.stubEnv("AUTO_DISTRIBUTE", "1");
  const { importWorkbook } = await import("@/services/import.service");
  const data = workbook();
  const preview = await importWorkbook(data, true, "admin@example.test", "synthetic.xlsx");
  if (!("preview" in preview)) throw new Error("Expected import preview");
  expect(preview.preview.movesKey).toBe("");
  m.snapshot.mockResolvedValue({ companies: [], contacts: [{ id: 8, companyId: 99, emails: ["client@example.test"], source: "scraper", billingRole: "cc" }], deptEmails: [], suppliers: [], probity: [] });

  const stale = await importWorkbook(data, false, "admin@example.test", "synthetic.xlsx", preview.preview.movesKey);
  expect(stale).toMatchObject({ movesChanged: true, preview: { moves: [{ email: "client@example.test", fromCompanyId: 99, toLabel: "Acme" }] } });
  expect(m.lock).toHaveBeenCalledTimes(1);
  expect(m.trace).toEqual(["snapshot", "lock"]);
  expect(m.updateContact).not.toHaveBeenCalled();
  expect(m.deleteContact).not.toHaveBeenCalled();
  expect(m.log).not.toHaveBeenCalled();
  expect(m.afterResponse).not.toHaveBeenCalled();

  if (!("movesChanged" in stale)) throw new Error("Expected refreshed preview");
  const reviewedKey = stale.preview.movesKey;
  expect(reviewedKey).toMatch(/^[a-f0-9]{64}$/);
  const confirmed = await importWorkbook(data, false, "admin@example.test", "synthetic.xlsx", reviewedKey);
  expect(confirmed).toHaveProperty("result");
  expect(m.deleteContact).toHaveBeenCalledTimes(1);
  expect(m.log).toHaveBeenCalledTimes(1);
});
