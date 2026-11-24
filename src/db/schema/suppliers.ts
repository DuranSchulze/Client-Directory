import { bigserial, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const suppliers_tb = pgTable("suppliers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"),                 // [Supplier /Contractor]; can be blank in the sheet
  particulars: text("particulars"),
  contactName: text("contact_name"), emails: text("emails").array().notNull().default([]),
  phones: text("phones").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_suppliers_name").on(t.name)]);

export type SupplierRow = typeof suppliers_tb.$inferSelect;
