import { drizzle } from "drizzle-orm/neon-serverless";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const { query, requireRouteAccess, setTransaction } = vi.hoisted(() => ({
  query: vi.fn(), requireRouteAccess: vi.fn(), setTransaction: vi.fn(),
}));
vi.mock("@/db", () => {
  const db = drizzle({ query } as never);
  return { db, withTransaction: (fn: (tx: typeof db) => unknown) => fn(Object.assign(db, { setTransaction })) };
});
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess }));

const read = async (params = {}) => {
  const { GET } = await import("@/app/api/inquiries/route");
  return GET(new Request(`http://localhost/api/inquiries?${new URLSearchParams(params)}`));
};

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [[0]] });
  query.mockResolvedValueOnce({ rows: [] });
});

it("uses reviewed status for pending and approved inquiries and pages newest contact first", async () => {
  query.mockResolvedValueOnce({ rows: [[12]] });
  const response = await read({ page: "2", size: "10" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], total: 12, all: 12 });
  expect(requireRouteAccess).toHaveBeenCalledWith("directory");
  expect(setTransaction).toHaveBeenCalledWith({ isolationLevel: "repeatable read", accessMode: "read only" });
  const [[page, pageParams], [count, countParams]] = query.mock.calls;
  const predicate = count.text.split(" where ")[1];
  expect(page.text.replace(/\$\d+/g, "?")).toContain(predicate.replace(/\$\d+/g, "?"));
  expect(countParams).toEqual(["pending", "approved", "status", "status", "status", "status", "status", "inquiry"]);
  expect(predicate).toContain('then "candidates"."fields"');
  expect(predicate).toContain("else jsonb_build_object('value', (\"candidates\".\"reviewed\"");
  expect(page.text).toMatch(/->>'value' desc nulls last, "candidates"\."id" limit \$\d+ offset \$\d+$/);
  expect(pageParams.slice(-3)).toEqual(["last_contact", 10, 10]);
});

it("searches name, company and normalized emails literally, and links the first company by name", async () => {
  const fields = {
    name: { value: "Reviewed Name" }, company: null, emails: { value: ["  FIRST@EXAMPLE.TEST  ", "second@example.test"] },
    stage: null, department: null, services: null, first_contact: null, last_contact: null,
  };
  const client = { companyId: 9, name: "A Client" };
  query.mockReset()
    .mockResolvedValueOnce({ rows: [[10, "pending", fields, client], [11, "approved", fields, null]] })
    .mockResolvedValueOnce({ rows: [[20]] }).mockResolvedValueOnce({ rows: [[2]] });
  const response = await read({ q: "%_\\", sort: "company:asc" });
  expect(await response.json()).toEqual({
    items: [{ id: 10, reviewState: "pending", fields, client }, { id: 11, reviewState: "approved", fields, client: null }],
    total: 2, all: 20,
  });
  const [[page, pageParams], , [total, totalParams]] = query.mock.calls;
  for (const statement of [page, total]) {
    expect(statement.text.match(/ ilike /g)).toHaveLength(3);
    expect(statement.text).toContain("exists (select 1 from unnest(ARRAY(SELECT lower(btrim(email,");
  }
  for (const params of [pageParams, totalParams]) {
    expect(params.filter((value: unknown) => value === "%\\%\\_\\\\%")).toHaveLength(3);
  }
  expect(page.text).toContain('from "contacts" inner join "companies" on "contacts"."company_id" = "companies"."id"');
  expect(page.text).toContain('"contacts"."emails" && ARRAY(SELECT lower(btrim(email,');
  expect(page.text).toMatch(/order by "companies"\."name", "companies"\."id" limit \$\d+/);
  expect(page.text).toMatch(/->>'value' asc nulls last, "candidates"\."id"/);
  expect(pageParams.slice(-2)).toEqual(["company", 25]);
});

it.each(["name", "stage"])("accepts %s sorting", async (key) => {
  expect((await read({ sort: `${key}:desc` })).status).toBe(200);
  expect(query.mock.calls[0][1].slice(-2)).toEqual([key, 25]);
});

it.each(Object.entries({ page: "0", size: "5", sort: "status:asc", q: "\0" }))("validates %s before using the database", async (field, value) => {
  const response = await read({ [field]: value });
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("field", field);
  expect(query).not.toHaveBeenCalled();
});

it("requires directory access before using the database", async () => {
  requireRouteAccess.mockRejectedValue(new AppError(403, "Access denied"));
  expect((await read()).status).toBe(403);
  expect(query).not.toHaveBeenCalled();
});
