import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
vi.mock("@/db", () => ({ db: {} }));

it("queries only approved candidates, coalesces reviewed fields, caps reads and excludes owned/internal emails", async () => {
  const chain = { from: vi.fn(), where: vi.fn(), innerJoin: vi.fn(), orderBy: vi.fn(), limit: vi.fn().mockResolvedValue([]) };
  for (const fn of [chain.from, chain.where, chain.innerJoin, chain.orderBy]) fn.mockReturnValue(chain);
  const ex = { select: vi.fn().mockReturnValue(chain), selectDistinct: vi.fn().mockReturnValue(chain) };
  const { listLinkedCandidates, listUnlinkedCandidates, findApprovedCandidate } = await import("@/repositories/candidates.repository");
  const dialect = new PgDialect();
  await listLinkedCandidates(undefined, ex as unknown as Executor);
  expect(dialect.sqlToQuery(ex.selectDistinct.mock.calls[0][0].fields).sql).toMatch(/coalesce\("candidates"\."reviewed", "candidates"\."fields"\)/);
  expect(dialect.sqlToQuery(chain.innerJoin.mock.calls[0][1]).sql).toContain("&&");
  expect(dialect.sqlToQuery(chain.where.mock.calls[0][0]).params).toContain("approved");
  expect(chain.limit).toHaveBeenLastCalledWith(5000);
  await listUnlinkedCandidates(ex as unknown as Executor);
  const unlinked = dialect.sqlToQuery(chain.where.mock.calls[1][0]);
  expect(unlinked.sql).toContain('NOT EXISTS (SELECT 1 FROM "contacts"');
  expect(unlinked.sql).toContain('NOT EXISTS (SELECT 1 FROM "dept_emails"');
  expect(unlinked.sql).toMatch(/cardinality\(ARRAY\(SELECT lower\(jsonb_array_elements_text/);
  expect(unlinked.sql).toContain('> 0');
  expect(unlinked.params).toContain("approved");
  expect(chain.limit).toHaveBeenLastCalledWith(5000);
  await findApprovedCandidate(7, ex as unknown as Executor);
  expect(dialect.sqlToQuery(chain.where.mock.calls[2][0]).params).toEqual([7, "approved"]);
});
