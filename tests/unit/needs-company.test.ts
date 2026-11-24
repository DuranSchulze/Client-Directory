import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  queue: vi.fn(), all: vi.fn(), companies: vi.fn(), contacts: vi.fn(),
  tx: { setTransaction: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/db", () => ({ db: {}, withTransaction: (fn: (tx: typeof m.tx) => unknown) => fn(m.tx) }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: vi.fn() }));
vi.mock("@/repositories/candidates.repository", () => ({
  listNeedsQueue: m.queue, listUnlinkedCandidates: m.all,
}));
vi.mock("@/repositories/companies.repository", () => ({ listCompanies: m.companies }));
vi.mock("@/repositories/contacts.repository", () => ({ listContacts: m.contacts }));

beforeEach(async () => {
  vi.clearAllMocks();
  (await import("@/services/company-rollup-cache")).invalidateCompanyRollupCache();
  m.companies.mockResolvedValue([{ id: 1, name: "Acme" }]);
  m.contacts.mockResolvedValue([
    { companyId: 1, emails: ["owner@acme.test", "owner@gmail.com", "owner@subsidiary.test"] },
    { companyId: 2, emails: ["owner@unknown.test"] },
  ]);
});

it("suggests by corporate domain and never by free-mail provider", async () => {
  const { suggestCompany } = await import("@/services/needs-company.service");
  const companies = [{ id: 1, name: "Acme" }, { id: 2, name: "Other" }];
  const contacts = [{ companyId: 1, emails: ["billing@acme.test", "owner@yahoo.com.ph"] }, { companyId: 2, emails: ["other@example.org"] }];
  const candidate = (email: string) => ({ id: 9, fields: { emails: { value: [email], source: "gmail", confidence: 1 } } });
  expect(suggestCompany(candidate("New@ACME.TEST"), companies, contacts)).toEqual({ companyId: 1, name: "Acme" });
  expect(suggestCompany(candidate("new@yahoo.com.ph"), companies, contacts)).toBeNull();
  expect(suggestCompany(candidate("new@unknown.test"), companies, contacts)).toBeNull();
  expect(suggestCompany({ id: 10, fields: {} }, companies, contacts)).toBeNull();
});

it("defaults to page one with 25 rows and no search", async () => {
  m.queue.mockResolvedValue([]);
  const { GET } = await import("@/app/api/needs-company/route");
  const response = await GET(new Request("http://localhost/api/needs-company"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], total: 0, suggested: 0 });
  expect(m.queue).toHaveBeenCalledExactlyOnceWith(m.tx);
});

it("suggests companies, pages a search in memory and counts suggestions across the whole queue", async () => {
  const candidate = { id: 42, fields: { emails: { value: ["New@ACME.TEST"] } } };
  m.queue.mockResolvedValue([
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, fields: { company: { value: "Acme Ltd" }, emails: { value: [`c${i}@example.test`] } } })),
    { id: 20, fields: { emails: { value: ["other@subsidiary.test"] } } },
    { id: 21, fields: { emails: { value: ["other@gmail.com"] } } },
    { id: 22, fields: { emails: { value: ["other@unknown.test"] } } },
    candidate,
  ]);
  const { GET } = await import("@/app/api/needs-company/route");
  const response = await GET(new Request("http://localhost/api/needs-company?page=2&size=10&q=%20Acme%20"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [{ ...candidate, suggestion: { companyId: 1, name: "Acme" } }], total: 11, suggested: 2,
  });
  expect(m.tx.setTransaction).toHaveBeenCalledExactlyOnceWith({ isolationLevel: "repeatable read", accessMode: "read only" });
  for (const read of [m.queue, m.companies, m.contacts]) expect(m.tx.setTransaction).toHaveBeenCalledBefore(read);
  expect(m.all).not.toHaveBeenCalled();
  // A second page within the TTL is served from the cached queue.
  await GET(new Request("http://localhost/api/needs-company?page=1&size=10"));
  expect(m.queue).toHaveBeenCalledTimes(1);
});

it.each([
  ["page", "0"], ["page", "-1"], ["page", "1.5"], ["page", "x"], ["page", ""],
  ["size", "0"], ["size", "11"], ["size", "25.5"], ["size", "2.5e1"], ["size", ""],
  ["q", "Acme%00"],
])("returns 400 for invalid %s=%s before reading the queue", async (field, value) => {
  const { GET } = await import("@/app/api/needs-company/route");
  const response = await GET(new Request(`http://localhost/api/needs-company?${field}=${value}`));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ field });
  expect(m.tx.setTransaction).not.toHaveBeenCalled();
  expect(m.queue).not.toHaveBeenCalled();
});
