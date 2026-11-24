import { bigserial, boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Scraper-owned tables, outside the Directory schema export.
export const ext_jobs = pgTable("jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  params: jsonb("params").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
  progress: jsonb("progress"),
});

export const ext_schedule = pgTable("schedule", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull(),
  intervalMinutes: integer("interval_minutes").notNull(),
});
