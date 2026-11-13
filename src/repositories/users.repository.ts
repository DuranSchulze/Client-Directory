import "server-only";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { directory_users_tb as users } from "@/db/schema/directory-users";
import { directory_roles_tb as roles } from "@/db/schema/directory-roles";

const selection = { ...getTableColumns(users), role: { id: roles.id, name: roles.name, routes: roles.routes, locked: roles.locked } };

export async function findUserByEmail(email: string, ex: Executor = db) {
  return (await ex.select(selection).from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(eq(users.email, email)).limit(1))[0] ?? null;
}
export async function findUserById(id: number, ex: Executor = db) {
  return (await ex.select(selection).from(users).innerJoin(roles, eq(users.roleId, roles.id)).where(eq(users.id, id)).limit(1))[0] ?? null;
}
export type JoinedUser = NonNullable<Awaited<ReturnType<typeof findUserById>>>;
export async function listUsers(ex: Executor = db) {
  return ex.select(selection).from(users).innerJoin(roles, eq(users.roleId, roles.id)).orderBy(users.id);
}
export async function updateUserRole(id: number, roleId: number, ex: Executor = db) {
  await ex.update(users).set({ roleId }).where(eq(users.id, id));
}
export async function countActiveOwners(roleId: number, ex: Executor = db) {
  return (await ex.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.roleId, roleId), eq(users.active, true))))[0].count;
}
export async function hasUsers(ex: Executor = db): Promise<boolean> {
  return (await ex.select({ id: users.id }).from(users).limit(1)).length > 0;
}
export async function insertAdmin(input: { email: string; name: string; passwordHash: string; roleId: number }, ex: Executor = db) {
  return (await ex.insert(users).values(input).returning())[0];
}
