import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { sensitive_reveals_tb as reveals } from "@/db/schema/sensitive-reveals";

export async function listReveals(companyId: number, ex: Executor = db) {
  return ex.select({ userEmail: reveals.userEmail, at: reveals.at }).from(reveals).where(eq(reveals.companyId, companyId)).orderBy(desc(reveals.at), desc(reveals.id)).limit(10);
}
export async function insertReveal(input: typeof reveals.$inferInsert, ex: Executor = db) { await ex.insert(reveals).values(input); }
