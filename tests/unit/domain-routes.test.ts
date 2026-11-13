import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const guards = vi.hoisted(() => ({ requireSession: vi.fn(), requireRouteAccess: vi.fn() }));
vi.mock("@/lib/auth/guard", () => guards);
vi.mock("@/db", () => ({ db: {}, withTransaction: vi.fn() }));
const endpoints: { path: string; load: () => Promise<Record<string, unknown>>; methods: string[] }[] = [
  { path: "/companies", load: () => import("@/app/api/companies/route"), methods: ["GET", "POST"] },
  { path: "/companies/1", load: () => import("@/app/api/companies/[id]/route"), methods: ["GET", "PATCH"] },
  { path: "/companies/1/contacts", load: () => import("@/app/api/companies/[id]/contacts/route"), methods: ["GET", "POST"] },
  { path: "/companies/1/contacts/2", load: () => import("@/app/api/companies/[id]/contacts/[contactId]/route"), methods: ["PATCH", "DELETE"] },
  { path: "/companies/1/reveal-account", load: () => import("@/app/api/companies/[id]/reveal-account/route"), methods: ["POST"] },
  { path: "/companies/export", load: () => import("@/app/api/companies/export/route"), methods: ["GET"] },
  { path: "/probity", load: () => import("@/app/api/probity/route"), methods: ["GET", "POST"] },
  { path: "/probity/1", load: () => import("@/app/api/probity/[id]/route"), methods: ["GET", "PATCH"] },
  { path: "/suppliers", load: () => import("@/app/api/suppliers/route"), methods: ["GET", "POST"] },
  { path: "/suppliers/1", load: () => import("@/app/api/suppliers/[id]/route"), methods: ["GET", "PATCH"] },
  { path: "/dept-emails", load: () => import("@/app/api/dept-emails/route"), methods: ["GET", "POST"] },
  { path: "/dept-emails/1", load: () => import("@/app/api/dept-emails/[id]/route"), methods: ["GET", "PATCH"] },
  { path: "/needs-company", load: () => import("@/app/api/needs-company/route"), methods: ["GET"] },
  { path: "/needs-company/1/attach", load: () => import("@/app/api/needs-company/[candidateId]/attach/route"), methods: ["POST"] },
  { path: "/counts", load: () => import("@/app/api/counts/route"), methods: ["GET"] },
];
beforeEach(() => vi.resetAllMocks());
it.each([401, 403])("guards every domain read and write with %i", async (status) => {
  guards.requireSession.mockImplementation(async () => { if (status === 401) throw new AppError(401, "Sign in required"); return { userId: 1 }; });
  guards.requireRouteAccess.mockRejectedValue(new AppError(status, status === 401 ? "Sign in required" : "Access denied"));
  for (const endpoint of endpoints) for (const method of endpoint.methods) {
    const route = await endpoint.load();
    const handler = route[method] as (request: Request, context: { params: Promise<{ id: string; contactId: string; candidateId: string }> }) => Promise<Response>;
    const response = await handler(new Request(`https://directory.example/api${endpoint.path}`, { method, ...(method === "GET" ? {} : { body: "{}" }) }),
      { params: Promise.resolve({ id: "1", contactId: "2", candidateId: "1" }) });
    expect(response.status, `${method} ${endpoint.path}`).toBe(status);
    expect((await response.json()).error).toBeTruthy();
  }
});
