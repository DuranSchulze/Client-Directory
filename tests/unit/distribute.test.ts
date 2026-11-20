import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CandidateItem } from "@/lib/api-types";
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), guard: vi.fn(), candidates: vi.fn(), contacts: vi.fn(), dept: vi.fn(), suppressions: vi.fn(), insert: vi.fn(), refresh: vi.fn(), suppress: vi.fn(), find: vi.fn(), remove: vi.fn(), user: vi.fn() }));
vi.mock("@/db", () => ({ db: {}, withTransaction: m.transaction }));
vi.mock("@/repositories/candidates.repository", () => ({ listDistributable: m.candidates }));
vi.mock("@/repositories/contacts.repository", () => ({ listContacts: m.contacts, insertContact: m.insert, findContact: m.find, deleteContact: m.remove }));
vi.mock("@/repositories/dept-emails.repository", () => ({ listDeptEmails: m.dept }));
vi.mock("@/repositories/ownership.repository", () => ({ lockEmailOwnership: m.lock, tryDistributionLock: m.guard, listSuppressions: m.suppressions, suppressEmails: m.suppress }));
vi.mock("@/services/probity.service", () => ({ refreshProbityMatches: m.refresh }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: m.user }));
const tx = { transaction: true };
const seed = { id: 1, companyId: 1, emails: ["billing@acme.test"], source: null, billingRole: "main" };
const candidate = (...emails: unknown[]) => ({ id: 7, fields: { emails: { value: emails }, name: { value: "Pat" } } }) as CandidateItem;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("AUTO_DISTRIBUTE", "1"); vi.stubEnv("INTERNAL_DOMAINS", "");
  m.transaction.mockImplementation(async (fn) => fn(tx)); m.guard.mockResolvedValue(true);
  m.contacts.mockResolvedValue([seed]); m.dept.mockResolvedValue([]); m.suppressions.mockResolvedValue([]);
  m.candidates.mockResolvedValue([candidate("new@acme.test")]);
});
afterEach(() => vi.unstubAllEnvs());
it("normalizes pending/approved input, inserts one cc with only matching domains and refreshes once", async () => {
  m.candidates.mockResolvedValue([candidate(" NEW@ACME.TEST ", "new@acme.test", "free@gmail.com", "other@unknown.test", "invalid", null), candidate("second@acme.test")]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect(await distributeMatches()).toEqual({ added: 2, ambiguous: 0, skipped: 0 });
  expect(m.insert).toHaveBeenNthCalledWith(1, { companyId: 1, name: "Pat", emails: ["new@acme.test"], billingRole: "cc", source: "scraper" }, tx);
  expect(m.refresh).toHaveBeenCalledTimes(1);
  expect(m.guard.mock.invocationCallOrder[0]).toBeLessThan(m.lock.mock.invocationCallOrder[0]);
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.contacts.mock.invocationCallOrder[0]);
  for (const fn of [m.guard, m.lock, m.candidates, m.dept, m.suppressions, m.refresh]) expect(fn).toHaveBeenCalledWith(tx);
});
it("rejects ambiguous domains and domains shared across companies", async () => {
  m.contacts.mockResolvedValue([seed, { companyId: 2, emails: ["billing@other.test", "also@acme.test"], source: null }]);
  m.candidates.mockResolvedValue([candidate("new@acme.test"), candidate("new@acme.test", "new@other.test")]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect(await distributeMatches()).toEqual({ added: 0, ambiguous: 2, skipped: 0 });
  expect(m.insert).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it("excludes free-mail, internal domains and auto-added evidence", async () => {
  vi.stubEnv("INTERNAL_DOMAINS", " ACME.TEST, internal.test ");
  m.contacts.mockResolvedValue([seed, { companyId: 2, emails: ["a@new.test"], source: "scraper" }, { companyId: 1, emails: ["owner@yahoo.com.ph"], source: null }]);
  m.candidates.mockResolvedValue([candidate("new@acme.test"), candidate("new@new.test"), candidate("new@yahoo.com.ph"), candidate("bad", null)]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect(await distributeMatches()).toEqual({ added: 0, ambiguous: 0, skipped: 4 });
});
it.each(["contact", "department", "suppression"])("skips the whole candidate if any address is blocked by %s", async (owner) => {
  m.candidates.mockResolvedValue([candidate("new@acme.test", "owned@gmail.com")]);
  if (owner === "contact") m.contacts.mockResolvedValue([seed, { ...seed, emails: ["owned@gmail.com"] }]);
  if (owner === "department") m.dept.mockResolvedValue([{ emails: ["owned@gmail.com"] }]);
  if (owner === "suppression") m.suppressions.mockResolvedValue([{ email: "owned@gmail.com" }]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect((await distributeMatches()).skipped).toBe(1); expect(m.insert).not.toHaveBeenCalled();
});
it("skips overlapping candidates in one run and does nothing on the second run", async () => {
  m.candidates.mockResolvedValue([candidate("new@acme.test"), candidate("new@acme.test", "other@acme.test")]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect(await distributeMatches()).toEqual({ added: 1, ambiguous: 0, skipped: 1 });
  m.contacts.mockResolvedValue([seed, { ...seed, emails: ["new@acme.test"], source: "scraper" }]);
  expect(await distributeMatches()).toEqual({ added: 0, ambiguous: 0, skipped: 2 });
  expect(m.insert).toHaveBeenCalledTimes(1);
});
it("defaults off and skips a colliding run before taking the ownership lock or reading", async () => {
  const { distributeMatches } = await import("@/services/distribute.service");
  vi.stubEnv("AUTO_DISTRIBUTE", "");
  expect(await distributeMatches()).toEqual({ added: 0, ambiguous: 0, skipped: 0 });
  expect(m.transaction).not.toHaveBeenCalled();
  vi.stubEnv("AUTO_DISTRIBUTE", "1"); m.guard.mockResolvedValue(false);
  await distributeMatches();
  expect(m.lock).not.toHaveBeenCalled(); expect(m.candidates).not.toHaveBeenCalled();
});
it("deleting an auto-added contact suppresses its emails in the same transaction; rerun adds nothing", async () => {
  const auto = { ...seed, id: 2, source: "scraper", billingRole: "cc", emails: ["new@acme.test"] };
  m.find.mockResolvedValue(auto); m.contacts.mockResolvedValue([seed, auto]); m.user.mockResolvedValue({ email: "admin@test.test" });
  m.suppress.mockImplementation(async (emails) => m.suppressions.mockResolvedValue(emails.map((email: string) => ({ email }))));
  const { removeContact } = await import("@/services/contacts.service");
  await removeContact(1, 2);
  expect(m.suppress).toHaveBeenCalledWith(["new@acme.test"], 1, "admin@test.test", tx);
  expect(m.suppress.mock.invocationCallOrder[0]).toBeLessThan(m.remove.mock.invocationCallOrder[0]);
  m.contacts.mockResolvedValue([seed]);
  const { distributeMatches } = await import("@/services/distribute.service");
  expect((await distributeMatches()).skipped).toBe(1);
  expect(m.insert).not.toHaveBeenCalled();
});
it("propagates failures to roll back all automatic writes", async () => {
  m.insert.mockRejectedValueOnce(new Error("Write failed"));
  const { distributeMatches } = await import("@/services/distribute.service");
  await expect(distributeMatches()).rejects.toThrow("Write failed");
  expect(m.refresh).not.toHaveBeenCalled();
});
