import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { contacts_tb as contacts } from "@/db/schema/contacts";
type ContactInsert = typeof contacts.$inferInsert;

export async function listContacts(companyId: number | undefined = undefined, ex: Executor = db) {
  return ex.select().from(contacts).where(companyId === undefined ? undefined : eq(contacts.companyId, companyId)).orderBy(contacts.id);
}
export async function findContact(companyId: number, contactId: number, ex: Executor = db) {
  return (await ex.select().from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.id, contactId))).limit(1))[0] ?? null;
}
export async function insertContact(input: ContactInsert, ex: Executor = db) { return (await ex.insert(contacts).values(input).returning())[0]; }
export async function updateContact(id: number, input: Partial<ContactInsert>, ex: Executor = db) {
  return (await ex.update(contacts).set({ ...input, updatedAt: new Date() }).where(eq(contacts.id, id)).returning())[0] ?? null;
}
export async function demoteMain(companyId: number, ex: Executor = db) {
  await ex.update(contacts).set({ billingRole: "cc", updatedAt: new Date() }).where(and(eq(contacts.companyId, companyId), eq(contacts.billingRole, "main")));
}
export async function deleteContact(id: number, ex: Executor = db) { await ex.delete(contacts).where(eq(contacts.id, id)); }
