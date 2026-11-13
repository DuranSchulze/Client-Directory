import { bigserial, boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Directory login, separate from the Scraper's `users` table in the same database.
export const directory_users_tb = pgTable("directory_users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),                 // lower-cased on write
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),  // bcryptjs
  role: text("role").$type<"admin">().notNull().default("admin"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_directory_users_email").on(t.email)]);
