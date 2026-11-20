import { beforeEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { Executor } from "@/db";
import { AppError } from "@/lib/errors";
const m = vi.hoisted(() => ({ grant: vi.fn(), session: vi.fn(), latest: vi.fn(), counts: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: m.grant, requireSession: m.session }));
vi.mock("@/services/counts.service", () => ({ getCounts: m.counts }));
vi.mock("@/repositories/counts.repository", async (original) => ({ ...await original<object>(), lastMasterUpload: m.latest }));
beforeEach(() => vi.resetAllMocks());
it("reads no history as null and orders timestamp ties by descending id, returning ISO", async () => {
  const { lastMasterUpload } = await vi.importActual<typeof import("@/repositories/counts.repository")>("@/repositories/counts.repository");
  const at = new Date("2026-11-20T00:00:00Z");
  const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [[at, "admin@test.test", "new.xlsx"]] });
  const ex = drizzle({ query } as never) as unknown as Executor;
  expect(await lastMasterUpload(ex)).toBeNull();
  expect(await lastMasterUpload(ex)).toEqual({ at: at.toISOString(), by: "admin@test.test", fileName: "new.xlsx" });
  expect(query.mock.calls[0][0].text).toContain('order by "master_uploads"."uploaded_at" desc, "master_uploads"."id" desc limit');
});
it.each(["import", "directory"])("exposes freshness with only the %s grant and rejects denied and unauthenticated reads", async (grant) => {
  const { GET: upload } = await import("@/app/api/import/xlsx/route");
  const { GET: counts } = await import("@/app/api/counts/route");
  const endpoint = grant === "import" ? upload : counts;
  const lastMasterUpload = { at: "2026-11-20T00:00:00.000Z", by: "admin@test.test", fileName: "clients.xlsx" };
  m.grant.mockImplementation(async (requested) => { if (requested !== grant) throw new AppError(403, "Denied"); });
  m.latest.mockResolvedValue(lastMasterUpload); m.counts.mockResolvedValue({ lastMasterUpload });
  const response = await endpoint();
  expect(response.status).toBe(200);
  expect((await response.json()).item.lastMasterUpload).toEqual(lastMasterUpload);
  expect(m.grant).toHaveBeenCalledWith(grant);
  for (const status of [403, 401]) {
    m.grant.mockRejectedValueOnce(new AppError(status, "Denied"));
    expect((await endpoint()).status).toBe(status);
  }
});
