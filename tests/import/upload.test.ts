import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { readUpload } from "@/lib/import/upload";
import { IMPORT_LIMITS } from "@/lib/import/contract";

const m = vi.hoisted(() => ({ requireSession: vi.fn(), requireRouteAccess: vi.fn(), importWorkbook: vi.fn() }));
vi.mock("@/lib/auth/guard", () => m);
vi.mock("@/services/import.service", () => ({ importWorkbook: m.importWorkbook }));
beforeEach(() => {
  vi.resetAllMocks();
  m.requireSession.mockResolvedValue({ userId: 1 });
  m.requireRouteAccess.mockResolvedValue({ email: "admin@example.test", role: "admin" });
  m.importWorkbook.mockResolvedValue({ preview: { companies: 1 } });
});
afterEach(() => vi.unstubAllEnvs());
function multipart(check?: string): Request {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "synthetic.xlsx"));
  if (check) form.set("check", check);
  return new Request("http://localhost/api/import/xlsx", { method: "POST", body: form });
}
it("reads a multipart file and the dry-run flag", async () => {
  expect(await readUpload(multipart("1"))).toEqual({ data: Buffer.from([1, 2, 3]), check: true });
  expect((await readUpload(multipart())).check).toBe(false);
});
it("caps the actual streamed request even if content-length is absent or false", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(IMPORT_LIMITS.bytes)); controller.enqueue(new Uint8Array(1)); }, cancel });
    const request = new Request("http://localhost/api/import/xlsx", { method: "POST", headers, body, duplex: "half" } as RequestInit);
    await expect(readUpload(request)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalled();
  }
});
it("guards the route before reading uploads and preserves the response contract", async () => {
  const { POST } = await import("@/app/api/import/xlsx/route");
  m.requireSession.mockRejectedValueOnce(new AppError(401, "Sign in required"));
  expect((await POST(multipart())).status).toBe(401);
  m.requireRouteAccess.mockRejectedValueOnce(new AppError(403, "Access denied"));
  expect((await POST(multipart())).status).toBe(403);
  expect(m.importWorkbook).not.toHaveBeenCalled();
  const response = await POST(multipart("1"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ preview: { companies: 1 } });
  expect(m.importWorkbook).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), true, "admin@example.test");
  const oversized = await POST(new Request("http://localhost/api/import/xlsx", { method: "POST", headers: { "content-length": String(IMPORT_LIMITS.bytes + 1) }, body: "x" }));
  expect(oversized.status).toBe(413);
});
