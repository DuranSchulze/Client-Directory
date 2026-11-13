import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Mandatory: the Scraper owns every other table in this database. Without the filter, push offers to drop them.
  tablesFilter: ["companies", "contacts", "probity_clients", "suppliers", "dept_emails", "sensitive_reveals", "directory_users"],
  strict: true,
});
