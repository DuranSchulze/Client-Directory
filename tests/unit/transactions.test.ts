import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ end: vi.fn(), transaction: vi.fn(), pool: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class { constructor(options: unknown) { mocks.pool(options); } on = vi.fn(); end = mocks.end; },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => ({ transaction: mocks.transaction }) }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("shares one pool across transactions and closes it only on request", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const { closeDb, withTransaction } = await import("@/db");
  const tx = {};
  mocks.transaction.mockImplementation((fn) => fn(tx));
  const callback = vi.fn().mockResolvedValue("result");
  expect(await withTransaction(callback)).toBe("result");
  expect(callback).toHaveBeenCalledWith(tx);
  await expect(withTransaction(async () => { throw new Error("rollback"); })).rejects.toThrow("rollback");
  mocks.transaction.mockRejectedValueOnce(new Error("connection failure"));
  await expect(withTransaction(callback)).rejects.toThrow("connection failure");
  expect(mocks.pool).toHaveBeenCalledExactlyOnceWith({ connectionString: "postgresql://test:test@localhost/test" });
  expect(mocks.end).not.toHaveBeenCalled();
  await closeDb();
  expect(mocks.end).toHaveBeenCalledTimes(1);
});

it("requires DATABASE_URL outside the production build", async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("NEXT_PHASE", undefined);
  const { db, closeDb, withTransaction } = await import("@/db");
  expect(() => db.select()).toThrow("Set DATABASE_URL to connect to Postgres.");
  await expect(withTransaction(vi.fn())).rejects.toThrow("Set DATABASE_URL to connect to Postgres.");
  expect(mocks.transaction).not.toHaveBeenCalled();
  await closeDb();
});
