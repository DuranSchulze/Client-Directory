import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { companies_tb } from "@/db/schema/companies";
import { contacts_tb } from "@/db/schema/contacts";
import { PgDialect } from "drizzle-orm/pg-core";

it("declares both concurrency guards with the intended expressions and predicates", () => {
  const dialect = new PgDialect();
  const companies = getTableConfig(companies_tb);
  const tin = companies.indexes.find((index) => index.config.name === "uq_companies_tin_branch")!.config;
  expect(tin.unique).toBe(true);
  expect(tin.columns).toHaveLength(2);
  expect(dialect.sqlToQuery(tin.where!).sql).toContain('"companies"."tin" IS NOT NULL');
  const contacts = getTableConfig(contacts_tb);
  const main = contacts.indexes.find((index) => index.config.name === "uq_contacts_one_main")!.config;
  expect(main.unique).toBe(true);
  expect(dialect.sqlToQuery(main.where!).sql).toContain("= 'main'");
});
