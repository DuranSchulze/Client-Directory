import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), hasUsers: vi.fn(), owner: vi.fn(), insert: vi.fn(), hash: vi.fn() }));
vi.mock("@/db", () => ({ withTransaction: m.transaction }));
vi.mock("@/repositories/users.repository", () => ({ hasUsers: m.hasUsers, insertAdmin: m.insert }));
vi.mock("@/repositories/roles.repository", () => ({ ensureOwnerRole: m.owner, lockAccounts: m.lock }));
vi.mock("bcryptjs", () => ({ hash: m.hash }));
import { seedAdmin } from "../../scripts/seed-admin";
const tx = { transaction: true };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DIRECTORY_ADMIN_EMAIL", " ADMIN@EXAMPLE.TEST "); vi.stubEnv("DIRECTORY_ADMIN_PASSWORD", "secret");
  m.transaction.mockImplementation((fn) => fn(tx)); m.hasUsers.mockResolvedValue(false); m.owner.mockResolvedValue({ id: 3 }); m.hash.mockResolvedValue("private-hash");
});
afterEach(() => vi.unstubAllEnvs());
it("locks, creates/finds Owner and seeds the normalized admin with bcrypt 12, silently", async () => {
  const output = vi.spyOn(console, "log");
  try {
    await seedAdmin();
    expect(m.lock).toHaveBeenCalledWith(tx); expect(m.owner).toHaveBeenCalledWith(tx);
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.hasUsers.mock.invocationCallOrder[0]);
    expect(m.hash).toHaveBeenCalledWith("secret", 12);
    expect(m.insert).toHaveBeenCalledWith({ email: "admin@example.test", name: "Admin", passwordHash: "private-hash", roleId: 3 }, tx);
    expect(output).not.toHaveBeenCalled();
  } finally { output.mockRestore(); }
});
it("does nothing, including no role creation or password hashing, when users already exist", async () => {
  m.hasUsers.mockResolvedValue(true);
  await seedAdmin();
  expect(m.owner).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled(); expect(m.hash).not.toHaveBeenCalled();
});
it("refuses invalid seed credentials before inserting anything", async () => {
  vi.stubEnv("DIRECTORY_ADMIN_PASSWORD", "x".repeat(73));
  await expect(seedAdmin()).rejects.toThrow();
  expect(m.owner).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled();
});
