import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
vi.mock("@/db", () => ({ db: {} }));

it("fills supplier columns only while they remain empty, including safely encoded arrays", async () => {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const { updateImportSupplier } = await import("@/repositories/import.repository");
  await updateImportSupplier(3, { contactName: "Sheet name", emails: ["vendor@example.test"] }, { update } as unknown as Executor);
  const dialect = new PgDialect();
  const assignments = set.mock.calls[0][0];
  expect(dialect.sqlToQuery(assignments.contactName).sql).toContain('CASE WHEN "suppliers"."contact_name" IS NULL');
  expect(dialect.sqlToQuery(assignments.contactName).sql).toContain('ELSE "suppliers"."contact_name" END');
  const emails = dialect.sqlToQuery(assignments.emails);
  expect(emails.sql).toContain("= '{}'::text[]");
  expect(emails.params[0]).toContain("vendor@example.test");
});
