import { bigserial, boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { RouteKey } from "../../lib/routes";

export const directory_roles_tb = pgTable("directory_roles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  routes: text("routes").array().$type<RouteKey[]>().notNull(),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_directory_roles_name").on(t.name)]);
