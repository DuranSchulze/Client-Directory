import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { DIRECTORY_TABLES } from "./src/db/directory-tables";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Mandatory: the Scraper owns every other table in this database. Without the filter, push offers to drop them.
  tablesFilter: DIRECTORY_TABLES,
  strict: true,
});
