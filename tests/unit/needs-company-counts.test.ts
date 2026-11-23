import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ candidates: vi.fn(), page: vi.fn(), queue: vi.fn() }));
vi.mock("@/db", () => ({
  db: {},
  withTransaction: (fn: (tx: { setTransaction: () => Promise<void> }) => unknown) => fn({ setTransaction: async () => {} }),
}));
vi.mock("@/repositories/candidates.repository", () => ({
  listUnlinkedCandidates: m.candidates, pageUnlinkedCandidates: m.page, listUnlinkedCandidateEmails: m.queue,
}));
vi.mock("@/repositories/counts.repository", () => ({ lastMasterUpload: async () => null, directoryCounts: async () => ({ companies: 3, contacts: 4, probity: 0, probityUnmatched: 0, suppliers: 0, deptEmails: 0 }) }));
vi.mock("@/repositories/companies.repository", () => ({ listCompanies: async () => [] }));
vi.mock("@/repositories/contacts.repository", () => ({ listContacts: async () => [] }));
vi.mock("@/lib/auth/guard", () => ({ requireSession: async () => ({ userId: 1 }), requireRouteAccess: async () => ({ email: "admin@example.test" }) }));
beforeEach(() => vi.clearAllMocks());
it.each([{ eligible: [] }, { eligible: [{ id: 1, fields: { emails: { value: ["valid@example.test"] } } }] }])("keeps the needs-company list and count on the same repository predicate: %j", async ({ eligible }) => {
  // The repository's cardinality predicate (candidate-queries.test.ts) removes empty-email rows before the cap.
  m.candidates.mockResolvedValue(eligible);
  m.page.mockResolvedValue({ items: eligible, total: eligible.length });
  m.queue.mockResolvedValue(eligible.map(({ fields }) => ({ emails: fields.emails.value })));
  const { getNeedsCompany } = await import("@/services/needs-company.service");
  const { GET } = await import("@/app/api/counts/route");
  const page = await getNeedsCompany({ page: null, size: null, q: null });
  expect(page.items).toHaveLength(eligible.length);
  const response = await GET();
  expect(response.status).toBe(200);
  expect((await response.json()).item.needsCompany).toBe(page.total);
  expect(m.candidates).toHaveBeenCalledTimes(1);
});
