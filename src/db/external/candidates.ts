import { bigint, bigserial, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { CandidateFields } from "@/lib/candidate-types";

// Read-only Scraper declaration; outside the schema path used by drizzle-kit.
export const ext_candidates = pgTable("candidates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  emailKey: text("email_key").notNull(),
  fields: jsonb("fields").$type<CandidateFields>().notNull(),
  reviewed: jsonb("reviewed").$type<CandidateFields | null>(),
  reviewState: text("review_state").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  masterMatch: text("master_match").$type<"email" | "domain" | null>(),
  masterIds: bigint("master_ids", { mode: "number" }).array(),
});
