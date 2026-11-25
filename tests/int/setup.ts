import { Client } from "pg";
import { afterAll } from "vitest";

function databaseIdentity({ host, port, database }: Client) {
  const hostname = host.toLowerCase().replace(/\.$/, "");
  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"];
  return JSON.stringify([localHosts.includes(hostname) ? "localhost" : hostname, port, database]);
}

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const appUrl = process.env.DATABASE_URL;
  const client = new Client({ connectionString: testUrl });
  if (appUrl && databaseIdentity(client) === databaseIdentity(new Client({ connectionString: appUrl }))) {
    throw new Error("TEST_DATABASE_URL must target a different database from DATABASE_URL");
  }
  try {
    await client.connect();
    const { rows: [target] } = await client.query<{ name: string }>("select current_database() as name");
    if (target.name !== "client_directory_test") throw new Error("TEST_DATABASE_URL must connect to client_directory_test");
  } finally {
    await client.end();
  }
  process.env.DATABASE_URL = testUrl;
  afterAll(async () => {
    const { closeDb } = await import("@/db");
    await closeDb();
  });
}
