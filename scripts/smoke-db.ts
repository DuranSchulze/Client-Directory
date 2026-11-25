import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { closeDb, db, withTransaction } from "@/db";
import { companies_tb as companies } from "@/db/schema/companies";

async function smokeTransactions() {
  const { rows: [target] } = await db.execute<{ name: string }>(sql`select current_database() as name`);
  assert.equal(target.name, "client_directory_test", "Transaction smoke checks require client_directory_test");
  const committed = `smoke-${randomUUID()}`;
  const rolledBack = `${committed}-rollback`;
  const matching = inArray(companies.nameKey, [committed, rolledBack]);
  const rollback = new Error("intentional rollback");
  try {
    await withTransaction(async (tx) => {
      await tx.insert(companies).values({ name: committed, nameKey: committed });
    });
    await assert.rejects(withTransaction(async (tx) => {
      await tx.insert(companies).values({ name: rolledBack, nameKey: rolledBack });
      throw rollback;
    }), (error) => error === rollback);
    assert.deepEqual(await db.select({ nameKey: companies.nameKey }).from(companies).where(matching), [{ nameKey: committed }]);
  } finally {
    await db.delete(companies).where(matching);
  }
  console.log("client_directory_test: commit and rollback verified, smoke rows removed.");
}

async function smoke() {
  const testUrl = process.env.TEST_DATABASE_URL;
  assert.ok(testUrl, "Set TEST_DATABASE_URL to client_directory_test");
  if (process.env.DATABASE_URL === testUrl) {
    await smokeTransactions();
    return;
  }

  const { rows: [clients] } = await db.execute<{ count: number }>(sql`select count(*)::int as count from clients`);
  assert.equal(clients.count, 2035);
  await db.select({ id: companies.id }).from(companies).limit(1);
  console.log(`client_directory: ${clients.count} clients, companies query passed.`);

  // The test run starts its own pool with the test URL before importing the database module.
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1]], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, "Transaction smoke check failed");
}

void smoke().finally(closeDb).catch((error) => {
  console.error(error instanceof Error ? error.message : "Database smoke check failed");
  process.exitCode = 1;
});
