import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { encryptAccountNo, decryptAccountNo } from "@/lib/crypto/account-no";
import { validateContact } from "@/services/validation.service";

const m = vi.hoisted(() => ({
  findCompany: vi.fn(), listCompanies: vi.fn(), insertCompany: vi.fn(), updateCompany: vi.fn(), findCompanyNameConflict: vi.fn(), findCompanyTinConflict: vi.fn(),
  listContacts: vi.fn(), findContact: vi.fn(), insertContact: vi.fn(), updateContact: vi.fn(), demoteMain: vi.fn(), deleteContact: vi.fn(),
  lockEmailOwnership: vi.fn(), findEmailOwner: vi.fn(), findDeptEmail: vi.fn(), listProbity: vi.fn(), updateProbity: vi.fn(), insertReveal: vi.fn(), listReveals: vi.fn(),
  requireSession: vi.fn(), requireRouteAccess: vi.fn(),
  findApprovedCandidate: vi.fn(), findDeptEmailById: vi.fn(), insertDeptEmail: vi.fn(), updateDeptEmail: vi.fn(),
}));
vi.mock("@/db", () => ({ withTransaction: async (fn: (tx: object) => unknown) => fn({ transaction: true }) }));
vi.mock("@/repositories/companies.repository", () => m);
vi.mock("@/repositories/contacts.repository", () => m);
vi.mock("@/repositories/ownership.repository", () => m);
vi.mock("@/repositories/probity.repository", () => m);
vi.mock("@/repositories/reveals.repository", () => m);
vi.mock("@/repositories/candidates.repository", () => ({ listLinkedCandidates: vi.fn().mockResolvedValue([]), findApprovedCandidate: m.findApprovedCandidate }));
vi.mock("@/repositories/dept-emails.repository", () => m);
vi.mock("@/lib/auth/guard", () => m);
const contact = { id: 10, companyId: 1, name: null, designation: null, emails: ["client@example.com"], phones: [], billingRole: "main", updatedAt: new Date() };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 3).toString("base64"));
  m.findCompany.mockResolvedValue({ id: 1, name: "Acme", accountNo: encryptAccountNo("00123456789") });
  m.listCompanies.mockResolvedValue([]); m.listProbity.mockResolvedValue([]); m.listReveals.mockResolvedValue([]);
  m.findEmailOwner.mockResolvedValue(null); m.findDeptEmail.mockResolvedValue(null);
  m.listContacts.mockResolvedValue([contact]); m.findContact.mockResolvedValue(contact);
  m.insertContact.mockImplementation((input) => ({ ...contact, ...input }));
  m.updateContact.mockImplementation((_id, input) => ({ ...contact, ...input }));
  m.requireSession.mockResolvedValue({ userId: 1 }); m.requireRouteAccess.mockResolvedValue({ email: "admin@example.test", name: "Admin", role: "admin" });
});
afterEach(() => vi.unstubAllEnvs());
it("logs before revealing and returns no number when the audit insert fails", async () => {
  const { POST } = await import("@/app/api/companies/[id]/reveal-account/route");
  const request = new Request("https://example.test/api/companies/1/reveal-account", { method: "POST" });
  const context = { params: Promise.resolve({ id: "1" }) };
  m.insertReveal.mockRejectedValueOnce(new Error("sensitive failure"));
  const failed = await POST(request, context);
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "Internal server error" });
  expect(failed.headers.get("cache-control")).toBe("no-store");
  const success = await POST(request, context);
  expect(await success.json()).toEqual({ item: { accountNo: "00123456789" } });
  expect(m.insertReveal).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1, field: "account_no", userEmail: "admin@example.test" }));
  expect(success.headers.get("cache-control")).toBe("no-store");
  m.requireSession.mockRejectedValueOnce(new AppError(401, "Sign in required"));
  expect((await POST(request, context)).status).toBe(401);
  m.requireRouteAccess.mockRejectedValueOnce(new AppError(403, "Access denied"));
  expect((await POST(request, context)).status).toBe(403);
});
it("checks ownership after locking and makes main atomically", async () => {
  const { saveContact } = await import("@/services/contacts.service");
  await saveContact(1, { billingRole: "main" }, 10);
  expect(m.lockEmailOwnership.mock.invocationCallOrder[0]).toBeLessThan(m.findEmailOwner.mock.invocationCallOrder[0]);
  expect(m.demoteMain.mock.invocationCallOrder[0]).toBeLessThan(m.updateContact.mock.invocationCallOrder[0]);
  m.findEmailOwner.mockResolvedValueOnce({ name: "Another Client", companyId: 2 });
  await expect(saveContact(1, { emails: ["owner@example.com"] }, 10)).rejects.toMatchObject({ status: 409, message: "This email already belongs to Another Client" });
  m.findDeptEmail.mockResolvedValueOnce({ id: 1 });
  await expect(saveContact(1, { emails: ["staff@example.com"] }, 10)).rejects.toMatchObject({ status: 409 });
});
it("protects main-contact demotion, deletion and the final contact", async () => {
  const { saveContact, removeContact } = await import("@/services/contacts.service");
  m.listContacts.mockResolvedValue([contact, { ...contact, id: 11, billingRole: "cc" }]);
  await expect(saveContact(1, { billingRole: "cc" }, 10)).rejects.toMatchObject({ status: 409, message: "Make another contact main first" });
  await expect(removeContact(1, 10)).rejects.toMatchObject({ status: 409, message: "Make another contact main first" });
  m.listContacts.mockResolvedValue([contact]);
  await expect(removeContact(1, 10)).rejects.toMatchObject({ status: 409 });
  expect(m.deleteContact).not.toHaveBeenCalled();
});
it("rejects company conflicts and invalid initial contacts before inserting", async () => {
  const { createCompany } = await import("@/services/companies.service");
  await expect(createCompany({ name: "Acme", contacts: [] }, "admin@example.test")).rejects.toMatchObject({ status: 400, field: "contacts" });
  m.findCompanyNameConflict.mockResolvedValueOnce({ id: 1 });
  await expect(createCompany({ name: "Acme", contacts: [{ emails: ["x@example.com"] }] }, "admin@example.test"))
    .rejects.toMatchObject({ status: 409, message: "A client with this registered name already exists." });
  m.findCompanyTinConflict.mockResolvedValueOnce({ id: 2 });
  await expect(createCompany({ name: "Other", tin: "123-456-789-000", contacts: [{ emails: ["x@example.com"] }] }, "admin@example.test"))
    .rejects.toMatchObject({ status: 409, field: "tin" });
  expect(m.insertCompany).not.toHaveBeenCalled();
});
it("attaches all approved-candidate emails as cc after checking ownership", async () => {
  const { attachCandidate } = await import("@/services/needs-company.service");
  m.findApprovedCandidate.mockResolvedValue({ id: 3, fields: { emails: { value: ["NEW@EXAMPLE.COM"], source: "gmail", confidence: 1 } } });
  m.listContacts.mockResolvedValue([]);
  expect(await attachCandidate(3, { companyId: 1 })).toMatchObject({ companyId: 1, emails: ["new@example.com"], billingRole: "cc" });
  expect(m.lockEmailOwnership.mock.invocationCallOrder[0]).toBeLessThan(m.findApprovedCandidate.mock.invocationCallOrder[0]);
  expect(m.insertContact).toHaveBeenCalledWith(expect.objectContaining({ billingRole: "cc" }), expect.anything());
  m.findEmailOwner.mockResolvedValueOnce({ name: "Other", companyId: 2 });
  await expect(attachCandidate(3, { companyId: 1 })).rejects.toMatchObject({ status: 409 });
  m.findApprovedCandidate.mockResolvedValue(null);
  await expect(attachCandidate(3, { companyId: 1 })).rejects.toMatchObject({ status: 404 });
});
it("attaches valid candidate addresses after dropping malformed entries and deduping, while strict contact validation remains unchanged", async () => {
  const { attachCandidate } = await import("@/services/needs-company.service");
  m.findApprovedCandidate.mockResolvedValue({ id: 3, fields: { emails: { value: [" NEW@EXAMPLE.COM ", "bad email", "new@example.com", null, 3, "other@example.test"] } } });
  expect(await attachCandidate(3, { companyId: 1 })).toMatchObject({ emails: ["new@example.com", "other@example.test"] });
  expect(() => validateContact({ emails: ["new@example.com", "bad email"] })).toThrow();
  await expect(attachCandidate(3, { companyId: "invalid" })).rejects.toMatchObject({ status: 400, field: "companyId" });
});
it.each([{ value: [] }, { value: ["bad", null] }, { value: undefined }])("rejects attaching when no valid candidate address remains: %j", async ({ value }) => {
  const { attachCandidate } = await import("@/services/needs-company.service");
  m.findApprovedCandidate.mockResolvedValue({ id: 3, fields: { emails: { value } } });
  await expect(attachCandidate(3, { companyId: 1 })).rejects.toMatchObject({ status: 400, field: "emails" });
  expect(m.insertContact).not.toHaveBeenCalled();
});
it.each(["N/A", "na", "-", "TbD", "#ref!", "no number"])("rejects account token/no-digits %s in create and PATCH", async (accountNo) => {
  const { createCompany, patchCompany } = await import("@/services/companies.service");
  await expect(createCompany({ name: "Acme", accountNo, contacts: [{ emails: ["x@example.com"] }] }, "admin@example.test")).rejects.toMatchObject({ status: 400, field: "accountNo" });
  await expect(patchCompany(1, { accountNo })).rejects.toMatchObject({ status: 400, field: "accountNo" });
  expect(m.insertCompany).not.toHaveBeenCalled(); expect(m.updateCompany).not.toHaveBeenCalled();
});
it.each([[" 0012-3456 (78) ", "0012-3456 (78)", "5678"], ["12-3", "12-3", "123"], ["  ", null, null], [null, null, null]])("stores normalized account %s and digit-only last four in create/PATCH", async (accountNo, normalized, last4) => {
  const { createCompany, patchCompany } = await import("@/services/companies.service");
  const saved = { id: 1, createdAt: new Date(), updatedAt: new Date() };
  m.insertCompany.mockImplementation((values) => ({ ...saved, ...values }));
  m.updateCompany.mockImplementation((_id, values) => ({ ...saved, name: "Acme", ...values }));
  await createCompany({ name: "Acme", accountNo, contacts: [{ emails: ["x@example.com"] }] }, "admin@example.test");
  await patchCompany(1, { accountNo });
  for (const values of [m.insertCompany.mock.calls[0][0], m.updateCompany.mock.calls[0][1]]) {
    expect(values.accountNoLast4).toBe(last4);
    expect(values.accountNo ? decryptAccountNo(values.accountNo) : null).toBe(normalized);
  }
});
it("checks department email ownership inside the shared lock before inserting", async () => {
  const { saveDeptEmail } = await import("@/services/dept-emails.service");
  m.findEmailOwner.mockResolvedValueOnce({ name: "Existing Client", companyId: 2 });
  await expect(saveDeptEmail({ department: "Accounting", emails: ["x@example.com"] })).rejects.toMatchObject({ status: 409 });
  expect(m.lockEmailOwnership.mock.invocationCallOrder[0]).toBeLessThan(m.findEmailOwner.mock.invocationCallOrder[0]);
  expect(m.insertDeptEmail).not.toHaveBeenCalled();
});
