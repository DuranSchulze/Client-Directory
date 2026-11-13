import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { companies_tb } from "@/db/schema/companies";
import { contacts_tb } from "@/db/schema/contacts";
import { PgDialect } from "drizzle-orm/pg-core";
import { directory_roles_tb } from "@/db/schema/directory-roles";
import { directory_users_tb } from "@/db/schema/directory-users";
import { DIRECTORY_TABLES } from "@/db/directory-tables";

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
it("uses directory roles with a required, non-cascading user FK and an eight-table allowlist", () => {
  expect(DIRECTORY_TABLES).toHaveLength(8);
  const roles = getTableConfig(directory_roles_tb), users = getTableConfig(directory_users_tb);
  expect(roles.name).toBe("directory_roles");
  expect(roles.indexes.some((i) => i.config.unique && i.config.name === "uq_directory_roles_name")).toBe(true);
  expect(directory_users_tb.roleId.notNull).toBe(true);
  expect(users.columns.some((c) => c.name === "role")).toBe(false);
  expect(users.foreignKeys[0].reference().foreignTable).toBe(directory_roles_tb);
  expect(users.foreignKeys[0].onDelete).not.toBe("cascade");
});
