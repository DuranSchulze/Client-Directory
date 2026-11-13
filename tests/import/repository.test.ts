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
it("guards company text, dates, flag upgrades and entity unions with typed values, and treats the bank pair atomically", async () => {
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  const ex = { update: vi.fn().mockReturnValue({ set }) } as unknown as Executor;
  const { updateImportCompany } = await import("@/repositories/import.repository");
  await updateImportCompany(1, { name: "Acme", nameKey: "acme", address: "Sheet", incorporatedOn: "2026-01-01", entities: ["DDS"], isNew: true, type: "Individual", accountNo: "cipher", accountNoLast4: "1234" }, ex);
  const values = set.mock.calls[0][0], dialect = new PgDialect();
  const query = (key: string) => dialect.sqlToQuery(values[key]);
  expect(query("address").sql).toContain('"companies"."address" = \'\'');
  expect(query("incorporatedOn").sql).toContain('"companies"."incorporated_on" IS NULL OR false');
  expect(query("incorporatedOn").params).toEqual(["2026-01-01"]);
  expect(query("isNew").sql).toContain('"companies"."is_new" = false');
  expect(query("type").sql).toContain("= 'Non-individual'");
  expect(query("entities").sql).toContain("SELECT DISTINCT e FROM unnest");
  expect(query("entities").params[0]).toContain("DDS");
  for (const key of ["accountNo", "accountNoLast4"]) expect(query(key).sql).toContain('CASE WHEN "companies"."account_no" IS NULL THEN');
  expect(query("accountNoLast4").sql).not.toContain('"account_no_last4" IS NULL');
});
it("guards probity date and array fills without text comparisons on dates", async () => {
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  const { updateImportProbity } = await import("@/repositories/import.repository");
  await updateImportProbity(1, { companyListed: "Acme", emails: ["sheet@example.test"], draftedOn: "2026-01-01", remarks: "Sheet" }, { update: vi.fn().mockReturnValue({ set }) } as unknown as Executor);
  const values = set.mock.calls[0][0], dialect = new PgDialect();
  expect(dialect.sqlToQuery(values.emails).sql).toContain('cardinality("probity_clients"."emails") = 0');
  expect(dialect.sqlToQuery(values.emails).params[0]).toContain("sheet@example.test");
  expect(dialect.sqlToQuery(values.draftedOn).sql).toContain('"drafted_on" IS NULL OR false');
  expect(dialect.sqlToQuery(values.remarks).sql).toContain('"remarks" = \'\'');
});
