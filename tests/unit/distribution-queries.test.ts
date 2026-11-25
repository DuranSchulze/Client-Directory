import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Executor } from "@/db";
vi.mock("@/db", () => ({ db: {} }));
it("tries the fixed transaction lock without waiting and upserts suppressions idempotently", async () => {
  const { tryDistributionLock, suppressEmails } = await import("@/repositories/ownership.repository");
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ acquired: true }] }).mockResolvedValueOnce({ rows: [{ acquired: false }] }).mockResolvedValue({ rows: [] });
  const ex = drizzle({ query } as never) as unknown as Executor;
  expect(await tryDistributionLock(ex)).toBe(true); expect(await tryDistributionLock(ex)).toBe(false);
  expect(query.mock.calls[0][0].text).toContain("pg_try_advisory_xact_lock(7340022)");
  await suppressEmails(["a@acme.test"], 1, "admin@test.test", ex);
  expect(query.mock.calls[2][0].text).toContain("on conflict do nothing");
});
