import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", () => { const db = drizzle({ query } as never); return { db, withTransaction: (fn: (tx: unknown) => unknown) => fn(Object.assign(Object.create(db), { setTransaction: async () => {} })) }; });
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: vi.fn() }));
vi.mock("@/repositories/companies.repository", () => {
  const companies = [
    { id: 1, name: "Mixed client" }, { id: 2, name: "Pending client" }, { id: 3, name: "No activity client" },
  ].map((company) => ({ ...company, createdAt: new Date(0), updatedAt: new Date(0) }));
  return { listCompanies: async () => companies, findCompany: async (id: number) => companies.find((company) => company.id === id) };
});
vi.mock("@/repositories/contacts.repository", () => ({ listContacts: async () => [] }));
vi.mock("@/repositories/probity.repository", () => ({ listProbity: async () => [], listProbityCompanyIds: async () => [] }));
vi.mock("@/repositories/reveals.repository", () => ({ listReveals: async () => [] }));

it("includes pending and approved candidates in list rollups, Gmail filter inputs, detail and CSV export reads", async () => {
  const rows = [
    { companyId: 1, id: 10, state: "approved", stage: "quoted" },
    { companyId: 1, id: 11, state: "pending", stage: "paid" },
    { companyId: 2, id: 12, state: "pending", stage: "quoted" },
  ];
  query.mockImplementation(async (_sql, params) => ({
    rows: rows.filter((row) => params.includes(row.state) && (params.filter((p: unknown) => typeof p === "number").length === 1 || params.includes(row.companyId)))
      .map(({ companyId, id, stage }) => [companyId, id, { stage: { value: stage, source: "gmail", confidence: 1 } }]),
  }));
  const { GET: list } = await import("@/app/api/companies/route");
  const { GET: detail } = await import("@/app/api/companies/[id]/route");
  const { GET: exportCsv } = await import("@/app/api/companies/export/route");
  const { items } = await (await list(new Request("https://example.test/api/companies"))).json() as import("@/lib/api-types").CompaniesResponse;
  expect(items[0].gmail).toMatchObject({ stage: "paid", candidateIds: [10, 11] });
  expect(items.filter((item) => item.gmail.stage === "quoted").map((item) => item.id)).toEqual([2]);
  expect(items.filter((item) => item.gmail.candidateIds.length === 0).map((item) => item.id)).toEqual([3]);

  const response = await detail(new Request("https://example.test/api/companies/1"), { params: Promise.resolve({ id: "1" }) });
  const { item } = await response.json() as import("@/lib/api-types").CompanyDetailResponse;
  expect(item.activity.candidates.map((candidate) => candidate.id)).toEqual([10, 11]);
  expect(item.activity.summary.stage).toBe("paid");

  const csv = await (await exportCsv()).text();
  expect(csv).toContain('"Pending client"');
  expect(csv).toContain('"Mixed client"');
  // The list builds the cached rollup (reviewed-override keys come first); the CSV export reuses that cache, so only detail queries again.
  expect(query.mock.calls.map(([, params]) => (params as unknown[]).filter((p) => p === "pending" || p === "approved" || typeof p === "number"))).toEqual([
    ["pending", "approved", 5000],
    ["pending", "approved", 1, 5000],
  ]);
});
