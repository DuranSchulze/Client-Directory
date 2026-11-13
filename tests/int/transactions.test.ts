import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database transactions", () => {
  it("commits, rolls back and includes repository calls in the same transaction", async () => {
    const { withTransaction } = await import("@/db");
    const { findUserByEmail, insertAdmin } = await import("@/repositories/users.repository");
    const { directory_users_tb } = await import("@/db/schema/directory-users");
    const { eq } = await import("drizzle-orm");
    const email = `${randomUUID()}@example.test`;
    const rolledBack = `${randomUUID()}@example.test`;
    try {
      await withTransaction(async (tx) => {
        await insertAdmin({ email, name: "Transaction test", passwordHash: "not-a-login" }, tx);
        expect(await findUserByEmail(email, tx)).not.toBeNull();
      });
      expect(await findUserByEmail(email)).not.toBeNull();
      await expect(withTransaction(async (tx) => {
        await insertAdmin({ email: rolledBack, name: "Rollback test", passwordHash: "not-a-login" }, tx);
        expect(await findUserByEmail(rolledBack, tx)).not.toBeNull();
        throw new Error("Injected rollback");
      })).rejects.toThrow("Injected rollback");
      expect(await findUserByEmail(rolledBack)).toBeNull();
    } finally {
      await withTransaction(async (tx) => { await tx.delete(directory_users_tb).where(eq(directory_users_tb.email, email)); });
    }
  }, 30000);
});
