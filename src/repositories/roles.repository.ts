import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { directory_roles_tb as roles } from "@/db/schema/directory-roles";
import { directory_users_tb as users } from "@/db/schema/directory-users";
import { ROUTES } from "@/lib/routes";
import type { RoleInput } from "@/lib/api-types";

// Explicit qualifiers survive Drizzle's single-table SELECT projection and preserve the outer correlation.
const selection = { id: roles.id, name: roles.name, routes: roles.routes, locked: roles.locked, users: sql<number>`(SELECT count(*)::int FROM ${users} WHERE "directory_users"."role_id" = "directory_roles"."id")` };
export async function lockAccounts(ex: Executor = db) {
  await ex.execute(sql`LOCK TABLE directory_roles, directory_users IN SHARE ROW EXCLUSIVE MODE`);
}
export async function listRoles(ex: Executor = db) { return ex.select(selection).from(roles).orderBy(roles.id); }
export async function findRole(id: number, ex: Executor = db) { return (await ex.select(selection).from(roles).where(eq(roles.id, id)).limit(1))[0] ?? null; }
export async function findOwnerRole(ex: Executor = db) { return (await ex.select(selection).from(roles).where(and(eq(roles.name, "Owner"), eq(roles.locked, true))).limit(1))[0] ?? null; }
export async function ensureOwnerRole(ex: Executor = db) {
  await ex.insert(roles).values({ name: "Owner", routes: [...ROUTES], locked: true }).onConflictDoNothing({ target: roles.name });
  const owner = await findOwnerRole(ex);
  if (!owner) throw new Error("Owner role is not locked; review the roles migration");
  return owner;
}
export async function insertRole(input: RoleInput, ex: Executor = db) { return (await ex.insert(roles).values(input).returning())[0]; }
export async function updateRole(id: number, input: RoleInput, ex: Executor = db) { await ex.update(roles).set(input).where(eq(roles.id, id)); }
export async function deleteRole(id: number, ex: Executor = db) { await ex.delete(roles).where(eq(roles.id, id)); }
