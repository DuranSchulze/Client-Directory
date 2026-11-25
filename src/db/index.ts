import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Next collects route modules during builds without runtime credentials.
const url = process.env.DATABASE_URL || (process.env.NEXT_PHASE === "phase-production-build" ? "postgresql://build:build@localhost/build" : "");
const pool = new Pool({ connectionString: url });
pool.on("error", (error) => console.error("Idle database connection error", error.message));
const database = drizzle(pool);
// Route modules can be imported before any database operation.
export const db = url ? database : new Proxy(database, {
  get() { throw new Error("Set DATABASE_URL to connect to Postgres."); },
});
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export function closeDb(): Promise<void> {
  return pool.end();
}
