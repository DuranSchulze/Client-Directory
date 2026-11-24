import { beforeEach, expect, it, vi } from "vitest";
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

it("returns progress, last finish, and the next time calculated from the latest job's start", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: { startedAt: started, completed: 17 },
    lastStartedAt: "2026-11-24T05:03:00Z", lastFinishedAt: finished, intervalMinutes: 30,
  }] });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: {
    running: { startedAt: "2026-11-24T05:00:00.000Z", completed: 17 },
    nextAt: "2026-11-24T05:33:00.000Z", lastFinishedAt: "2026-11-24T05:06:00.000Z",
  } });
  expect(m.requireRouteAccess).toHaveBeenCalledExactlyOnceWith("directory");
});

it("excludes stale heartbeats before choosing the latest running or paused job", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: null, lastStartedAt: started, lastFinishedAt: finished, intervalMinutes: 15,
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
    running: { startedAt: started, completed: null }, lastStartedAt: started, lastFinishedAt: null, intervalMinutes: null,
  }] });
  expect(await (await GET()).json()).toEqual({ item: {
    running: { startedAt: "2026-11-24T05:00:00.000Z", completed: 0 }, nextAt: null, lastFinishedAt: null,
  } });
  const { sql } = new PgDialect().sqlToQuery(m.execute.mock.calls[0][0]);
  expect(sql).toContain('CASE WHEN "schedule"."enabled" THEN "schedule"."interval_minutes" END');
});

it("omits the next time when the schedule is enabled and there have been no jobs", async () => {
  m.execute.mockResolvedValue({ rows: [{
    running: null, lastStartedAt: null, lastFinishedAt: null, intervalMinutes: 15,
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
