import { drizzle } from "drizzle-orm/neon-serverless";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const { query, requireRouteAccess } = vi.hoisted(() => ({ query: vi.fn(), requireRouteAccess: vi.fn() }));
vi.mock("@/db", () => ({ db: drizzle({ query } as never) }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess }));

const read = async (id: string) => {
  const { GET } = await import("@/app/api/inquiries/[id]/timeline/route");
  return GET(new Request(`http://localhost/api/inquiries/${id}/timeline`), { params: Promise.resolve({ id }) });
};
const message = {
  date: "2026-11-25T02:00:00Z", stage: "inquiry", department: "Sales", mailbox: "sales@example.test",
  amounts: [], raw_item_id: 8, snippet: "Subject: Quote request\nCould you send an estimate?",
};
const timeline = { items: [message], truncated: true };
const empty = { items: [], truncated: false };

beforeEach(() => vi.resetAllMocks());

it("returns timeline messages and the truncation flag using the inquiry predicate", async () => {
  query.mockResolvedValue({ rows: [[timeline]] });
  const response = await read("1");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: timeline });
  expect(requireRouteAccess).toHaveBeenCalledWith("directory");
  const [[{ text }, params]] = query.mock.calls;
  expect(text).toContain("->'value' from \"candidates\" where");
  expect(params).toEqual([
    "timeline", "timeline", "timeline", "timeline", "timeline",
    1, "pending", "approved", "status", "status", "status", "status", "status", "inquiry",
  ]);
});

it("returns an empty timeline for an eligible row without one", async () => {
  query.mockResolvedValue({ rows: [[null]] });
  const response = await read("1");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: empty });
});

it("returns 404 when the lookup finds no eligible row", async () => {
  query.mockResolvedValue({ rows: [] });
  expect((await read("1")).status).toBe(404);
});

it.each(["0", "abc", "9007199254740992"])("rejects invalid id %s before querying", async (id) => {
  const response = await read(id);
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("field", "id");
  expect(query).not.toHaveBeenCalled();
});

it.each([401, 403])("enforces directory access before querying (%s)", async (status) => {
  requireRouteAccess.mockRejectedValue(new AppError(status, "Access denied"));
  expect((await read("1")).status).toBe(status);
  expect(query).not.toHaveBeenCalled();
});

it.skipIf(!process.env.TEST_DATABASE_URL)("reads effective timelines only for eligible candidates in PostgreSQL", async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  const [{ Pool, neonConfig }, { default: ws }] = await Promise.all([import("@neondatabase/serverless"), import("ws")]);
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: testUrl });
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create temp table candidates (id bigint primary key, review_state text, fields jsonb, reviewed jsonb) on commit drop");
      await client.query("set local search_path = pg_temp");
      await client.query(
        `insert into candidates values
          (1, 'pending', $1, null),
          (2, 'approved', $1, $2),
          (3, 'approved', $1, '{"status":"active"}'),
          (4, 'rejected', $1, null),
          (5, 'pending', '{"status":{"value":"inquiry"}}', null)`,
        [JSON.stringify({ status: { value: "inquiry" }, timeline: { value: timeline } }),
          JSON.stringify({ timeline: { items: [{ ...message, raw_item_id: 9 }], truncated: false } })],
      );
      query.mockImplementation((config, params) => client.query(config, params));

      expect(await (await read("1")).json()).toEqual({ item: timeline });
      expect(await (await read("2")).json()).toEqual({ item: { items: [{ ...message, raw_item_id: 9 }], truncated: false } });
      expect(await (await read("5")).json()).toEqual({ item: empty });
      for (const id of ["3", "4", "6"]) expect((await read(id)).status).toBe(404);
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
});
