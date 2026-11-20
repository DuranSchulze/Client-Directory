import { bigserial, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ImportResult } from "../../lib/import/contract";

export const master_uploads_tb = pgTable("master_uploads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fileName: text("file_name").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary").$type<ImportResult["changes"]>().notNull(),
});
