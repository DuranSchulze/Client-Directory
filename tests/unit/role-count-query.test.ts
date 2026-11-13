import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
import { directory_roles_tb as roles } from "@/db/schema/directory-roles";
vi.mock("@/db", () => ({ db: {} }));

it("keeps the role's outer id qualified in every generated account-count subquery", async () => {
  const db = drizzle.mock(), queries: string[] = [];
  const ex = {
    select: (fields: Record<string, AnyPgColumn | SQL>) => {
      const query = db.select(fields).from(roles);
      return { from: () => ({
        orderBy: () => { queries.push(query.orderBy(roles.id).toSQL().sql); return Promise.resolve([]); },
        where: (where: SQL) => ({ limit: () => { queries.push(query.where(where).limit(1).toSQL().sql); return Promise.resolve([]); } }),
      }) };
    },
  } as unknown as Executor;
  const { listRoles, findRole, findOwnerRole } = await import("@/repositories/roles.repository");
  await listRoles(ex); await findRole(7, ex); await findOwnerRole(ex);
  expect(queries).toHaveLength(3);
  for (const query of queries) expect(query).toContain('WHERE "directory_users"."role_id" = "directory_roles"."id"');
});
