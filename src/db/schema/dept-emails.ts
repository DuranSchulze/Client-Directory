import { bigserial, index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const dept_emails_tb = pgTable("dept_emails", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  department: text("department").notNull(),   // section rows: "ACCOUNTING DEPARTMENT", "LEGAL DEPARTMENT · CORPORATE TEAM"
  name: text("name"), title: text("title"),
  emails: text("emails").array().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("idx_dept_emails_emails").using("gin", t.emails)]);

export type DeptEmailRow = typeof dept_emails_tb.$inferSelect;
