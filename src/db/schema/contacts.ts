import { bigint, bigserial, foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { BillingRole } from "../../lib/enums";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { companies_tb } from "./companies";

export const contacts_tb = pgTable("contacts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: bigint("company_id", { mode: "number" }).notNull(),
  name: text("name"), designation: text("designation"),
  emails: text("emails").array().notNull().default([]),   // lower-cased on write
  phones: text("phones").array().notNull().default([]),   // E.164 on write
  billingRole: text("billing_role").$type<BillingRole>().notNull().default("none"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_contacts_company").on(t.companyId),
  uniqueIndex("uq_contacts_one_main").on(t.companyId).where(sql`${t.billingRole} = 'main'`),
  index("idx_contacts_emails").using("gin", t.emails),
  foreignKey({ name: "fk_contacts_company", columns: [t.companyId], foreignColumns: [companies_tb.id] }).onDelete("cascade"),
]);

export type ContactRow = typeof contacts_tb.$inferSelect;
