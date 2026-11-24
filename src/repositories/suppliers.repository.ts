import "server-only";
import { count, eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { suppliers_tb as suppliers } from "@/db/schema/suppliers";
import { pageOrder, substringFilter, type PageWindow, type SortDirection } from "./paging";
type SupplierInsert = typeof suppliers.$inferInsert;

export async function listSuppliers(ex: Executor = db) { return ex.select().from(suppliers).orderBy(suppliers.id); }
export const SUPPLIER_SORT_COLUMNS = { name: suppliers.name };
export async function listSuppliersPage({ limit, offset, search }: PageWindow, direction: SortDirection, ex: Executor) {
  const filter = substringFilter(search, [suppliers.name, suppliers.particulars, suppliers.contactName], [suppliers.emails, suppliers.phones]);
  const rows = await ex.select().from(suppliers).where(filter)
    .orderBy(pageOrder(suppliers.name, direction), suppliers.id).limit(limit).offset(offset);
  const [{ all }] = await ex.select({ all: count() }).from(suppliers);
  const total = filter ? (await ex.select({ total: count() }).from(suppliers).where(filter))[0].total : all;
  return { rows, total, all };
}
export async function findSupplier(id: number, ex: Executor = db) { return (await ex.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0] ?? null; }
export async function insertSupplier(input: SupplierInsert, ex: Executor = db) { return (await ex.insert(suppliers).values(input).returning())[0]; }
export async function updateSupplier(id: number, input: Partial<SupplierInsert>, ex: Executor = db) {
  return (await ex.update(suppliers).set({ ...input, updatedAt: new Date() }).where(eq(suppliers.id, id)).returning())[0] ?? null;
}
