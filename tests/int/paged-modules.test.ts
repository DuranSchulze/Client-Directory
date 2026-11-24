import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { companies_tb, contacts_tb, dept_emails_tb, probity_clients_tb, suppliers_tb } from "@/db/schema";
import type { CompaniesPage, DeptEmailsPage, ProbityPage, SuppliersPage } from "@/lib/api-types";

vi.mock("@/lib/auth/guard", () => ({
  requireSession: async () => ({ userId: 1 }),
  requireRouteAccess: async () => ({ email: "paging@example.test" }),
}));

const routes = {
  companies: () => import("@/app/api/companies/route"),
  probity: () => import("@/app/api/probity/route"),
  suppliers: () => import("@/app/api/suppliers/route"),
  "dept-emails": () => import("@/app/api/dept-emails/route"),
};
type Module = keyof typeof routes;
const request = (module: Module, params: Record<string, string> = {}, init?: RequestInit) =>
  new Request(`http://localhost/api/${module}?${new URLSearchParams(params)}`, init);
async function read<T>(module: Module, params: Record<string, string> = {}): Promise<T> {
  const response = await (await routes[module]()).GET(request(module, params));
  expect(response.status).toBe(200);
  return response.json();
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("paged routes on PostgreSQL", () => {
  const marker = `paging-${randomUUID()}`;
  const department = `${marker} Department`;
  const team = `${department} · Later Team`;
  const contactEmail = `billing@${marker}.test`;
  const secondaryEmail = `receipts@${marker}.test`;
  const createdAt = new Date("2026-11-13T17:00:00.000Z");
  const ids: Record<Module, number[]> = { companies: [], probity: [], suppliers: [], "dept-emails": [] };
  const mailboxWrites: number[] = [];

  beforeAll(async () => {
    const { withTransaction } = await import("@/db");
    const rows = Array.from({ length: 11 }, (_, n) => n);
    await withTransaction(async (tx) => {
      ids.companies = (await tx.insert(companies_tb).values(rows.map<typeof companies_tb.$inferInsert>((n) => ({
        name: `${marker} Client ${n}`, nameKey: `${marker} client ${n}`, createdAt, engagement: n === 10 ? "active" : null,
        acctgService: n === 10 ? `  ${marker} Service  ` : null, supervisor: n === 10 ? `  ${marker} Supervisor  ` : null,
      }))).returning({ id: companies_tb.id })).map((r) => r.id);
      await tx.insert(contacts_tb).values([
        { companyId: ids.companies[10], name: `${marker} billing`, source: "scraper", emails: [contactEmail] },
        { companyId: ids.companies[10], emails: [secondaryEmail] },
      ]);
      ids.probity = (await tx.insert(probity_clients_tb).values(rows.map<typeof probity_clients_tb.$inferInsert>((n) => ({
        companyListed: `${marker} Tied`, companyId: n === 10 ? ids.companies[10] : null, matchedBy: n === 10 ? "manual" : null,
        contactPerson: n === 10 ? `contact-only-${marker}` : null, referenceNo: n === 10 ? `reference-only-${marker}` : null,
      }))).returning({ id: probity_clients_tb.id })).map((r) => r.id);
      const otherSpellings = ["literal%X\\token", "literalABC_\\token", "literal%_token"];
      ids.suppliers = (await tx.insert(suppliers_tb).values(rows.map((n) => ({
        name: n === 10 ? null : `${marker} Tied`,
        particulars: `${marker} ${n === 10 ? "literal%_\\token" : otherSpellings[n % otherSpellings.length]}`,
      }))).returning({ id: suppliers_tb.id })).map((r) => r.id);
      ids["dept-emails"] = (await tx.insert(dept_emails_tb).values(rows.map((n) => ({
        department: n === 10 ? team : department, name: `${marker} mailbox ${n}`, sortOrder: 5,
        emails: [`mailbox${n}@${marker}.test`],
      }))).returning({ id: dept_emails_tb.id })).map((r) => r.id);
    });
  }, 30000);

  afterAll(async () => {
    const { withTransaction } = await import("@/db");
    await withTransaction(async (tx) => {
      await tx.delete(dept_emails_tb).where(inArray(dept_emails_tb.id, [...ids["dept-emails"], ...mailboxWrites]));
      await tx.delete(suppliers_tb).where(inArray(suppliers_tb.id, ids.suppliers));
      await tx.delete(probity_clients_tb).where(inArray(probity_clients_tb.id, ids.probity));
      await tx.delete(companies_tb).where(inArray(companies_tb.id, ids.companies));
    });
  }, 30000);

  it.each([
    ["companies", "added:desc"], ["probity", "listed:desc"], ["suppliers", "name:desc"], ["dept-emails", "sortOrder:asc"],
  ] as const)("%s preserves a stable page boundary, filtered totals, and full-list mode", async (module, sort) => {
    const params = { size: "10", q: marker, sort };
    const first = await read<CompaniesPage>(module, { ...params, page: "1" });
    const last = await read<CompaniesPage>(module, { ...params, page: "2" });
    expect(first.items.map((r) => r.id)).toEqual(ids[module].slice(0, 10));
    expect(last.items.map((r) => r.id)).toEqual(ids[module].slice(10));
    expect(last.total).toBe(11);
    expect(last.all).toBeGreaterThanOrEqual(last.total);
    expect(await read(module, { ...params, page: "99" })).toMatchObject({ items: [], total: 11, all: last.all });
    expect(await read(module, { ...params, page: "1", q: `no match ${marker}` })).toMatchObject({ items: [], total: 0, all: last.all });
    const full = await read<{ items: { id: number }[] }>(module, { q: "ignored", sort: "invalid" });
    expect(Object.keys(full)).toEqual(["items"]);
    expect(full.items).toContainEqual(last.items[0]);
    for (const [input, field] of [
      [{ page: "" }, "page"], [{ page: "1", sort: "constructor:asc" }, "sort"], [{ page: "1", size: "11" }, "size"],
    ] as const) {
      const response = await (await routes[module]()).GET(request(module, input));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ field });
    }
  }, 90000);

  it("searches Probity contact, reference and linked names, and counts matches outside the search", async () => {
    for (const q of [`CONTACT-ONLY-${marker}`, `reference-only-${marker}`, `${marker} Client 10`]) {
      const page = await read<ProbityPage>("probity", { page: "1", q });
      expect(page.total).toBe(1);
      expect(page.matched).toBeGreaterThanOrEqual(1);
      expect(page.items[0]).toMatchObject({ id: ids.probity[10], companyId: ids.companies[10], companyName: `${marker} Client 10` });
    }
    for (const dir of ["asc", "desc"]) {
      const page = await read<ProbityPage>("probity", { page: "1", q: marker, sort: `ref:${dir}` });
      expect(page.items[0].id).toBe(ids.probity[10]);
      expect(page.items.slice(1).every((item) => item.referenceNo === null)).toBe(true);
    }
  }, 60000);

  it("treats wildcard characters literally and puts unnamed suppliers last in both directions", async () => {
    const literal = await read<SuppliersPage>("suppliers", { page: "1", q: `${marker} LITERAL%_\\TOKEN` });
    expect(literal.items.map((r) => r.id)).toEqual([ids.suppliers[10]]);
    for (const dir of ["asc", "desc"]) {
      const page = await read<SuppliersPage>("suppliers", { page: "1", q: marker, sort: `name:${dir}` });
      expect(page.items.map((r) => r.id)).toEqual(ids.suppliers);
      expect(page.items.at(-1)?.name).toBeNull();
    }
  }, 60000);

  it("includes teams in the department filter and leaves unfiltered headings available on later pages", async () => {
    const params = { page: "2", size: "10", dept: department };
    const page = await read<DeptEmailsPage>("dept-emails", params);
    expect(page.items.map((r) => r.department)).toEqual([team]);
    expect(page.total).toBe(11);
    expect(page.departments.filter((r) => r.department.startsWith(marker))).toEqual([
      { department, count: 10 }, { department: team, count: 1 },
    ]);
    const search = await read<DeptEmailsPage>("dept-emails", { ...params, page: "1", q: "later team" });
    expect(search.total).toBe(1);
    expect(search.items[0].id).toBe(ids["dept-emails"][10]);
    expect(search.departments).toEqual(page.departments);
  }, 60000);

  it("allocates global consecutive mailbox orders under concurrent POSTs and honors explicit order", async () => {
    const { db } = await import("@/db");
    const [{ last }] = await db.select({ last: sql<number>`max(${dept_emails_tb.sortOrder})`.mapWith(Number) }).from(dept_emails_tb);
    const { POST } = await routes["dept-emails"]();
    const create = async (suffix: string, sortOrder?: number) => {
      const response = await POST(request("dept-emails", {}, { method: "POST", body: JSON.stringify({
        department, emails: [`${suffix}@${marker}.test`], sortOrder,
      }) }));
      expect(response.status).toBe(201);
      const { item } = await response.json() as { item: DeptEmailsPage["items"][number] };
      mailboxWrites.push(item.id);
      return item.sortOrder;
    };
    expect((await Promise.all([create("concurrent1"), create("concurrent2")])).sort((a, b) => a - b)).toEqual([last + 1, last + 2]);
    expect(await create("explicit", 0)).toBe(0);
  }, 60000);

  it("preserves Clients filters, chip counts before quick filtering, and full-list dependent reads", async () => {
    const params = { page: "1", q: marker, from: "invalid", to: "2026-11-14" };
    const page = await read<CompaniesPage>("companies", params);
    expect(page.total).toBe(11);
    expect(page.chipCounts).toMatchObject({ probity: 1, tin: 11, nogmail: 11 });
    expect(page.facets.services).toContain(`${marker} Service`);
    expect(page.facets.supervisors).toContain(`${marker} Supervisor`);
    expect(page.kpi.active).toBeGreaterThanOrEqual(1);
    for (const src of ["scraper", "probity"]) {
      const selected = await read<CompaniesPage>("companies", { ...params, src, from: "2026-11-14", quick: "probity" });
      expect(selected.items.map((r) => r.id)).toEqual([ids.companies[10]]);
    }
    const master = await read<CompaniesPage>("companies", { ...params, src: "master", quick: "probity" });
    expect(master.items).toEqual([]);
    expect(master.chipCounts).toMatchObject({ probity: 0, tin: 10 });
    const { getCompany } = await import("@/services/companies.service");
    expect((await getCompany(ids.companies[10])).probity.map((p) => p.id)).toContain(ids.probity[10]);
    const { readImportSnapshot } = await import("@/repositories/import.repository");
    const snap = await readImportSnapshot();
    expect(snap.companies.map((c) => c.id)).toContain(ids.companies[10]);
    expect(snap.deptEmails.map((d) => d.id)).toContain(ids["dept-emails"][10]);
  }, 90000);

  it("keeps the narrowed rollup equivalent for reviewed candidates with duplicate contact links", async () => {
    const { withTransaction } = await import("@/db");
    const { listLinkedCandidates, listLinkedCandidateRollups, listUnlinkedCandidates } = await import("@/repositories/candidates.repository");
    const { gmailRollup } = await import("@/services/activity.service");
    await withTransaction(async (tx) => {
      const fields = { emails: { value: ["old@example.test"] }, stage: { value: "quoted" }, needs_check: { value: ["review"] } };
      const reviewed = { emails: [contactEmail, secondaryEmail], stage: "paid", last_contact: "2026-11-14" };
      await tx.execute(sql`CREATE TEMP TABLE candidates (id bigint, review_state text, fields jsonb, reviewed jsonb) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO pg_temp.candidates VALUES (777, 'approved', ${JSON.stringify(fields)}::jsonb, ${JSON.stringify(reviewed)}::jsonb)`);
      const mailbox = { emails: { value: [`mailbox10@${marker}.test`] } };
      await tx.execute(sql`INSERT INTO pg_temp.candidates VALUES (778, 'approved', ${JSON.stringify(mailbox)}::jsonb, NULL)`);
      const projected = await listLinkedCandidateRollups(tx);
      const full = await listLinkedCandidates(undefined, tx);
      expect(projected.map(({ id, companyId }) => ({ id, companyId }))).toEqual([{ id: 777, companyId: ids.companies[10] }]);
      expect(gmailRollup(projected)).toEqual(gmailRollup(full));
      expect(gmailRollup(projected)).toEqual({ stage: "paid", lastContact: "2026-11-14", needsCheck: ["review"], candidateIds: [777] });
      expect(await listUnlinkedCandidates(tx)).toEqual([]);
    });
  }, 60000);

  it("matches and bulk-attaches against a company outside the first page, then undoes the attachment", async () => {
    const { withTransaction } = await import("@/db");
    const candidates = await import("@/repositories/candidates.repository");
    const { refreshProbityMatches } = await import("@/services/probity.service");
    const { attachAll, undoAttach } = await import("@/services/needs-company.service");
    const { listDeptEmails } = await import("@/repositories/dept-emails.repository");
    const email = `candidate@${marker}.test`;
    const queue = vi.spyOn(candidates, "listUnlinkedCandidates").mockResolvedValue([
      { id: 777, fields: { emails: { value: [email], source: "gmail", confidence: 1 } } },
    ]);
    try {
      await withTransaction(async (tx) => {
        await tx.update(probity_clients_tb).set({ companyId: null, matchedBy: null, emails: [contactEmail] })
          .where(eq(probity_clients_tb.id, ids.probity[10]));
        await refreshProbityMatches(tx);
        const [row] = await tx.select().from(probity_clients_tb).where(eq(probity_clients_tb.id, ids.probity[10]));
        expect(row).toMatchObject({ companyId: ids.companies[10], matchedBy: "email" });
      });
      const result = await attachAll();
      expect(result.contacts).toEqual([{ id: expect.any(Number), companyId: ids.companies[10] }]);
      expect(await undoAttach({ contacts: result.contacts })).toEqual({ removed: 1 });
      expect((await listDeptEmails()).find((row) => row.id === ids["dept-emails"][10])?.emails).toEqual([`mailbox10@${marker}.test`]);
    } finally {
      queue.mockRestore();
    }
  }, 90000);
});
