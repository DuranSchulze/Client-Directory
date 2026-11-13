import "server-only";
import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { probity_clients_tb as probity } from "@/db/schema/probity-clients";
type ProbityInsert = typeof probity.$inferInsert;

export async function listProbity(ex: Executor = db) { return ex.select().from(probity).orderBy(probity.id); }
export async function findProbity(id: number, ex: Executor = db) { return (await ex.select().from(probity).where(eq(probity.id, id)).limit(1))[0] ?? null; }
export async function insertProbity(input: ProbityInsert, ex: Executor = db) { return (await ex.insert(probity).values(input).returning())[0]; }
export async function updateProbity(id: number, input: Partial<ProbityInsert>, ex: Executor = db) {
  return (await ex.update(probity).set({ ...input, updatedAt: new Date() }).where(eq(probity.id, id)).returning())[0] ?? null;
}
