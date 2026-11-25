import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Next collects route modules during builds without runtime credentials.
const url = process.env.DATABASE_URL || (process.env.NEXT_PHASE === "phase-production-build" ? "postgresql://build:build@localhost/build" : "");
const missingUrl = "Set DATABASE_URL to connect to Postgres.";
const pool = new Pool({ connectionString: url });
const logConnectionError = (error: Error) => console.error("Database connection error", error.message);
pool.on("error", logConnectionError);
const database = drizzle(pool);
// Route modules can be imported before any database operation.
export const db = url ? database : new Proxy(database, {
  get() { throw new Error(missingUrl); },
});
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!url) throw new Error(missingUrl);
  // Drizzle's pool adapter starts BEGIN before its client-release handler.
  const client = await pool.connect();
  client.on("error", logConnectionError);
  try {
    return await drizzle(client).transaction(fn);
  } finally {
    client.removeListener("error", logConnectionError);
    client.release(client.getTransactionStatus() !== "I");
  }
}

export function closeDb(): Promise<void> {
  return pool.end();
}
