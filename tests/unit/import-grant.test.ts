import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const m = vi.hoisted(() => ({ session: vi.fn(), grant: vi.fn(), upload: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireSession: m.session, requireRouteAccess: m.grant }));
vi.mock("@/lib/import/upload", () => ({ readUpload: m.upload }));
vi.mock("@/services/import.service", () => ({ importWorkbook: m.commit }));
beforeEach(() => vi.resetAllMocks());
it("authorizes import with its own grant before reading or writing a workbook", async () => {
  const { POST } = await import("@/app/api/import/xlsx/route");
  m.grant.mockResolvedValue({ email: "importer@example.test" });
  m.upload.mockResolvedValue({ data: Buffer.from("synthetic"), check: true }); m.commit.mockResolvedValue({ preview: {} });
  expect((await POST(new Request("https://example.test/api/import/xlsx", { method: "POST" }))).status).toBe(200);
  expect(m.grant).toHaveBeenCalledWith("import");
  expect(m.commit).toHaveBeenCalledWith(Buffer.from("synthetic"), true, "importer@example.test");
  m.grant.mockRejectedValueOnce(new AppError(403, "You don't have access to this page")); m.upload.mockClear(); m.commit.mockClear();
  expect((await POST(new Request("https://example.test/api/import/xlsx", { method: "POST" }))).status).toBe(403);
  expect(m.upload).not.toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
