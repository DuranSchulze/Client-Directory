import { bigint, bigserial, boolean, foreignKey, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { directory_roles_tb } from "./directory-roles";

// Directory login, separate from the Scraper's `users` table in the same database.
export const directory_users_tb = pgTable("directory_users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),                 // lower-cased on write
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),  // bcryptjs
  roleId: bigint("role_id", { mode: "number" }).notNull(),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(0),
  tempPasswordEnc: text("temp_password_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_directory_users_email").on(t.email), foreignKey({ name: "fk_directory_users_role", columns: [t.roleId], foreignColumns: [directory_roles_tb.id] })]);
