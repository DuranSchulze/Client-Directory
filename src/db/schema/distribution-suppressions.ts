import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const distribution_suppressions_tb = pgTable("distribution_suppressions", {
  email: text("email").primaryKey(),
  companyId: bigint("company_id", { mode: "number" }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
