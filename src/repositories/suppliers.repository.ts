import "server-only";
import { eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { suppliers_tb as suppliers } from "@/db/schema/suppliers";
type SupplierInsert = typeof suppliers.$inferInsert;

export async function listSuppliers(ex: Executor = db) { return ex.select().from(suppliers).orderBy(suppliers.id); }
export async function findSupplier(id: number, ex: Executor = db) { return (await ex.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0] ?? null; }
export async function insertSupplier(input: SupplierInsert, ex: Executor = db) { return (await ex.insert(suppliers).values(input).returning())[0]; }
export async function updateSupplier(id: number, input: Partial<SupplierInsert>, ex: Executor = db) {
  return (await ex.update(suppliers).set({ ...input, updatedAt: new Date() }).where(eq(suppliers.id, id)).returning())[0] ?? null;
}
