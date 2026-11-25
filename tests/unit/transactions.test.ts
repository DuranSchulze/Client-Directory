import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn(), connect: vi.fn(), pool: vi.fn(),
  guardConnect: vi.fn(), guardQuery: vi.fn(), guardEnd: vi.fn(),
}));
vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  class Pool {
    constructor(options: unknown) { mocks.pool(options); }
    on = vi.fn();
    connect = mocks.connect;
    end = mocks.end;
  }
  class Client {
    connect = mocks.guardConnect;
    query = mocks.guardQuery;
    end = mocks.guardEnd;
  }
  return { ...actual, Pool, Client, default: { ...actual.default, Pool, Client } };
});
afterEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.unstubAllEnvs(); });

function mockConnection() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    removeListener: vi.fn(),
    getTransactionStatus: vi.fn().mockReturnValue("I"),
    release: vi.fn(),
  };
  mocks.connect.mockResolvedValue(client);
  return client;
}

it("shares one pool across transactions and closes it only on request", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const { closeDb, withTransaction } = await import("@/db");
  const client = mockConnection();
  const callback = vi.fn(async () => "result");
  expect(await withTransaction(callback)).toBe("result");
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(withTransaction(async () => { throw new Error("rollback"); })).rejects.toThrow("rollback");
  expect(client.query.mock.calls.map(([query]) => query.text)).toEqual(["begin", "commit", "begin", "rollback"]);
  expect(client.release).toHaveBeenCalledTimes(2);
  expect(mocks.pool).toHaveBeenCalledExactlyOnceWith({ connectionString: "postgresql://test:test@localhost/test" });
  expect(mocks.end).not.toHaveBeenCalled();
  await closeDb();
  expect(mocks.end).toHaveBeenCalledTimes(1);
});

it("returns the checked-out connection after BEGIN fails and can run the next transaction", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const { withTransaction } = await import("@/db");
  const client = mockConnection();
  client.query.mockRejectedValueOnce(new Error("BEGIN failed"));
  const callback = vi.fn(async () => "result");
  await expect(withTransaction(callback)).rejects.toThrow("begin");
  expect(callback).not.toHaveBeenCalled();
  expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  expect(await withTransaction(callback)).toBe("result");
  expect(client.release).toHaveBeenCalledTimes(2);
});

it("discards a client when rollback leaves its transaction open", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const { withTransaction } = await import("@/db");
  const client = mockConnection();
  client.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("ROLLBACK failed"));
  client.getTransactionStatus.mockReturnValue("T");
  await expect(withTransaction(async () => { throw new Error("write failed"); })).rejects.toThrow("rollback");
  expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
});

it("requires DATABASE_URL outside the production build", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("NEXT_PHASE", undefined);
  const { db, closeDb, withTransaction } = await import("@/db");
  expect(() => db.select()).toThrow("Set DATABASE_URL to connect to Postgres.");
  await expect(withTransaction(vi.fn())).rejects.toThrow("Set DATABASE_URL to connect to Postgres.");
  expect(mocks.connect).not.toHaveBeenCalled();
  await closeDb();
});

it("rejects an app database used as a test target even when DATABASE_URL is absent", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://test:test@localhost/client_directory");
  mocks.guardQuery.mockResolvedValue({ rows: [{ name: "client_directory" }] });
  await expect(import("../int/setup")).rejects.toThrow("TEST_DATABASE_URL must connect to client_directory_test");
  expect(mocks.guardQuery).toHaveBeenCalledExactlyOnceWith("select current_database() as name");
  expect(mocks.guardEnd).toHaveBeenCalledTimes(1);
  expect(process.env.DATABASE_URL).toBeUndefined();
});
