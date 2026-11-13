import "server-only";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as websocketDrizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
// Next collects route modules during builds without runtime credentials.
const url = process.env.DATABASE_URL ?? (process.env.NEXT_PHASE === "phase-production-build" ? "postgresql://build:build@localhost/build" : "");
export const db = drizzle(neon(url));
type TransactionDb = ReturnType<typeof websocketDrizzle>;
export type Tx = Parameters<Parameters<TransactionDb["transaction"]>[0]>[0];
export type Executor = typeof db | Tx;

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await websocketDrizzle(pool).transaction(fn);
  } finally {
    await pool.end();
  }
}
