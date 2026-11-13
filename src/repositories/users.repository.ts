import "server-only";
import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { directory_users_tb as users } from "@/db/schema/directory-users";

export async function findUserByEmail(email: string, ex: Executor = db) {
  return (await ex.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null;
}
export async function findUserById(id: number, ex: Executor = db) {
  return (await ex.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
}
export async function hasUsers(ex: Executor = db): Promise<boolean> {
  return (await ex.select({ id: users.id }).from(users).limit(1)).length > 0;
}
export async function insertAdmin(input: { email: string; name: string; passwordHash: string }, ex: Executor = db) {
  return (await ex.insert(users).values(input).returning())[0];
}
