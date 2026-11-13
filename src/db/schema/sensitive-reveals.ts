import { bigint, bigserial, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Append-only audit log: no update or delete routes exist for it.
export const sensitive_reveals_tb = pgTable("sensitive_reveals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: bigint("company_id", { mode: "number" }).notNull(),
  field: text("field").notNull(),
  userEmail: text("user_email").notNull(),
  ip: text("ip"), userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_reveals_company").on(t.companyId, t.at)]);
