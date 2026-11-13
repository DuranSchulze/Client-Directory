import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ end: vi.fn(), transaction: vi.fn(), pool: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(), neonConfig: {}, Pool: class { constructor(options: unknown) { mocks.pool(options); } end = mocks.end; },
}));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: vi.fn() }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: () => ({ transaction: mocks.transaction }) }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("creates a pool per transaction and always closes it on success or failure", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const { withTransaction } = await import("@/db");
  const tx = {};
  mocks.transaction.mockImplementation((fn) => fn(tx));
  const callback = vi.fn().mockResolvedValue("result");
  expect(await withTransaction(callback)).toBe("result");
  expect(callback).toHaveBeenCalledWith(tx);
  expect(mocks.end).toHaveBeenCalledTimes(1);
  await expect(withTransaction(async () => { throw new Error("rollback"); })).rejects.toThrow("rollback");
  expect(mocks.pool).toHaveBeenCalledTimes(2);
  expect(mocks.end).toHaveBeenCalledTimes(2);
  mocks.transaction.mockRejectedValueOnce(new Error("connection failure"));
  await expect(withTransaction(callback)).rejects.toThrow("connection failure");
  expect(mocks.end).toHaveBeenCalledTimes(3);
});
