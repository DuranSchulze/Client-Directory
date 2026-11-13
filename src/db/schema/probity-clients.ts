import { bigint, bigserial, date, foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { MatchedBy } from "../../lib/enums";
import { companies_tb } from "./companies";

export const probity_clients_tb = pgTable("probity_clients", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyListed: text("company_listed").notNull(),        // [COMPANY] as typed in the tab
  companyId: bigint("company_id", { mode: "number" }),    // set by the cross-check; null = not in All Clients
  matchedBy: text("matched_by").$type<MatchedBy>(),
  contactPerson: text("contact_person"),
  emails: text("emails").array().notNull().default([]),
  service: text("service"),
  agreementUrl: text("agreement_url"),
  draftedOn: date("drafted_on", { mode: "string" }),
  referenceNo: text("reference_no"),
  remarks: text("remarks"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [foreignKey({ name: "fk_probity_company", columns: [t.companyId], foreignColumns: [companies_tb.id] }).onDelete("set null")]);

export type ProbityRow = typeof probity_clients_tb.$inferSelect;
