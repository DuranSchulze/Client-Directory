import { Client } from "pg";
import { afterAll } from "vitest";

function databaseIdentity(connectionString: string) {
  const { host, port, database } = new Client({ connectionString });
  const hostname = host.toLowerCase().replace(/\.$/, "");
  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"];
  return JSON.stringify([localHosts.includes(hostname) ? "localhost" : hostname, port, database]);
}

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const appUrl = process.env.DATABASE_URL;
  if (appUrl && databaseIdentity(testUrl) === databaseIdentity(appUrl)) {
    throw new Error("TEST_DATABASE_URL must target a different database from DATABASE_URL");
  }
  process.env.DATABASE_URL = testUrl;
  afterAll(async () => {
    const { closeDb } = await import("@/db");
    await closeDb();
  });
}
