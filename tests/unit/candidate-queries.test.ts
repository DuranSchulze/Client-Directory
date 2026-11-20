import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
vi.mock("@/db", () => ({ db: {} }));

it("links pending and approved candidates, coalesces reviewed fields, caps reads and excludes owned/internal emails", async () => {
  const chain = { from: vi.fn(), where: vi.fn(), innerJoin: vi.fn(), orderBy: vi.fn(), limit: vi.fn().mockResolvedValue([]) };
  for (const fn of [chain.from, chain.where, chain.innerJoin, chain.orderBy]) fn.mockReturnValue(chain);
  const ex = { select: vi.fn().mockReturnValue(chain), selectDistinct: vi.fn().mockReturnValue(chain) };
  const { listLinkedCandidates, listUnlinkedCandidates, findApprovedCandidate } = await import("@/repositories/candidates.repository");
  const dialect = new PgDialect();
  await listLinkedCandidates(undefined, ex as unknown as Executor);
  expect(dialect.sqlToQuery(ex.selectDistinct.mock.calls[0][0].fields).sql).toMatch(/"candidates"\."fields" \|\| coalesce\(\(SELECT jsonb_object_agg\(key, jsonb_build_object\('value', value\)\)\s+FROM jsonb_each\("candidates"\."reviewed"\)/);
  expect(dialect.sqlToQuery(chain.innerJoin.mock.calls[0][1]).sql).toContain("&&");
  expect(dialect.sqlToQuery(chain.where.mock.calls[0][0]).params).toEqual(["pending", "approved"]);
  expect(chain.limit).toHaveBeenLastCalledWith(5000);
  await listUnlinkedCandidates(ex as unknown as Executor);
  const unlinked = dialect.sqlToQuery(chain.where.mock.calls[1][0]);
  expect(unlinked.sql).toContain('NOT EXISTS (SELECT 1 FROM "contacts"');
  expect(unlinked.sql).toContain('NOT EXISTS (SELECT 1 FROM "dept_emails"');
  expect(unlinked.sql).toContain("cardinality(ARRAY(SELECT lower(btrim(email,");
  expect(dialect.sqlToQuery(chain.innerJoin.mock.calls[0][1]).sql).toContain("lower(btrim(email, U&' \\0009");
  expect(unlinked.sql).toContain('> 0');
  expect(unlinked.params).toContain("approved");
  expect(chain.limit).toHaveBeenLastCalledWith(5000);
  await findApprovedCandidate(7, ex as unknown as Executor);
  expect(dialect.sqlToQuery(chain.where.mock.calls[2][0]).params).toEqual([7, "approved"]);
});

it("lists only pending and approved distributable candidates, preferring reviewed fields without a page cap", async () => {
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const { listDistributable } = await import("@/repositories/candidates.repository");
  await listDistributable(drizzle({ query } as never) as unknown as Executor);
  expect(query.mock.calls[0][1]).toEqual(["pending", "approved"]);
  expect(query.mock.calls[0][0].text).toContain('"fields" || coalesce((SELECT jsonb_object_agg(key, jsonb_build_object(\'value\', value))');
  expect(query.mock.calls[0][0].text).not.toContain("limit");
});
