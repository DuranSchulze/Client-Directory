import { beforeEach, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppError } from "@/lib/errors";
import { GET } from "@/app/api/scrape-status/route";

const m = vi.hoisted(() => ({ execute: vi.fn(), requireRouteAccess: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute: m.execute } }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: m.requireRouteAccess }));

const started = "2026-11-24T07:00:00+02:00";
const finished = "2026-11-24T05:06:00Z";
const empty = { running: null, nextAt: null, lastFinishedAt: null };
beforeEach(() => vi.resetAllMocks());

it("keeps the countdown anchored to the automatic scrape when a newer manual job runs", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: { startedAt: "2026-11-24T05:09:00Z", completed: 17 },
    lastAutoStartedAt: started, lastFinishedAt: finished, intervalMinutes: 30,
  }] });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: {
    running: { startedAt: "2026-11-24T05:09:00.000Z", completed: 17 },
    nextAt: "2026-11-24T05:30:00.000Z", lastFinishedAt: "2026-11-24T05:06:00.000Z",
  } });
  const { sql } = new PgDialect().sqlToQuery(m.execute.mock.calls[0][0]);
  expect(sql).toMatch(/\(SELECT to_json\(max\("jobs"\."started_at"\)\) FROM "jobs"\s+WHERE "jobs"\."name" = 'scrape' AND "jobs"\."params"->>'auto' = 'true'\) AS "lastAutoStartedAt"/);
  expect(sql).toMatch(/\(SELECT to_json\(max\("jobs"\."finished_at"\)\) FROM "jobs"\s+WHERE "jobs"\."name" = 'scrape' AND "jobs"\."status" IN \('done', 'done_with_errors'\)\) AS "lastFinishedAt"/);
  expect(m.requireRouteAccess).toHaveBeenCalledExactlyOnceWith("directory");
});

it.skipIf(!process.env.TEST_DATABASE_URL)("keeps the latest completed scrape when newer jobs fail or are not scrapes", async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  const pool = new Pool({ connectionString: testUrl });
  try {
    await drizzle(pool).transaction(async (tx) => {
      await tx.execute(sql`create temp table jobs (
        id bigint, name text, status text, started_at timestamptz, finished_at timestamptz,
        heartbeat_at timestamptz, params jsonb, progress jsonb
      ) on commit drop`);
      await tx.execute(sql`create temp table schedule (id integer, enabled boolean, interval_minutes integer) on commit drop`);
      await tx.execute(sql`set local search_path = pg_temp`);
      await tx.execute(sql`insert into jobs (id, name, status, finished_at) values
        (1, 'scrape', 'done', '2026-11-24T05:06:00Z'),
        (2, 'scrape', 'done_with_errors', '2026-11-24T06:06:00Z'),
        (3, 'scrape', 'failed', '2026-11-24T07:06:00Z'),
        (4, 'scrape', 'stopped', '2026-11-24T08:06:00Z'),
        (5, 'scrape', 'interrupted', '2026-11-24T09:06:00Z'),
        (6, 'extract', 'done', '2026-11-24T10:06:00Z')`);
      m.execute.mockImplementation((query: SQL) => tx.execute(query));

      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ item: { ...empty, lastFinishedAt: "2026-11-24T06:06:00.000Z" } });

      await tx.execute(sql`delete from jobs where id = 2`);
      expect(await (await GET()).json()).toEqual({ item: { ...empty, lastFinishedAt: "2026-11-24T05:06:00.000Z" } });
    });
  } finally {
    await pool.end();
  }
});

it("excludes stale heartbeats before choosing the latest running or paused job", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: null, lastAutoStartedAt: started, lastFinishedAt: finished, intervalMinutes: 15,
  }] });
  const response = await GET();
  expect(await response.json()).toEqual({ item: {
    running: null, lastFinishedAt: "2026-11-24T05:06:00.000Z", nextAt: "2026-11-24T05:15:00.000Z",
  } });
  const { sql } = new PgDialect().sqlToQuery(m.execute.mock.calls[0][0]);
  expect(sql).toMatch(/"jobs"\."status" IN \('running', 'paused'\)/);
  expect(sql).toMatch(/"jobs"\."heartbeat_at" BETWEEN statement_timestamp\(\) - interval '2 minutes' AND statement_timestamp\(\)\s+ORDER BY "jobs"\."started_at" DESC, "jobs"\."id" DESC\s+LIMIT 1/);
  expect(sql).toContain('"jobs"."progress"->\'done\'');
});

it("omits the next time if scheduling is disabled and defaults missing progress to zero", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: { startedAt: started, completed: null }, lastAutoStartedAt: started, lastFinishedAt: null, intervalMinutes: null,
  }] });
  expect(await (await GET()).json()).toEqual({ item: {
    running: { startedAt: "2026-11-24T05:00:00.000Z", completed: 0 }, nextAt: null, lastFinishedAt: null,
  } });
  const { sql } = new PgDialect().sqlToQuery(m.execute.mock.calls[0][0]);
  expect(sql).toContain('CASE WHEN "schedule"."enabled" THEN "schedule"."interval_minutes" END');
});

it("omits the next time when the schedule is enabled and there have been no automatic scrapes", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: null, lastAutoStartedAt: null, lastFinishedAt: null, intervalMinutes: 15,
  }] });
  expect(await (await GET()).json()).toEqual({ item: empty });
});

it.each(["jobs", "schedule"])("returns all nulls if PostgreSQL cannot find %s", async (table) => {
  const cause = Object.assign(new Error(`relation "${table}" does not exist`), { code: "42P01" });
  m.execute.mockRejectedValue(new Error("Query failed", { cause }));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: empty });
});

it("leaves other database failures on the error path", async () => {
  m.execute.mockRejectedValue(Object.assign(new Error("Denied"), { code: "42501" }));
  const response = await GET();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Internal server error" });
});

it("requires the directory grant before reading jobs", async () => {
  m.requireRouteAccess.mockRejectedValue(new AppError(403, "Access denied"));
  expect((await GET()).status).toBe(403);
  expect(m.execute).not.toHaveBeenCalled();
});
