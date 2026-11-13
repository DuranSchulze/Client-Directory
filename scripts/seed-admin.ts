import "dotenv/config";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { withTransaction } from "../src/db";
import { EMAIL_RE, normEmail } from "../src/lib/normalize";
import { hasUsers, insertAdmin } from "../src/repositories/users.repository";

async function main() {
  await withTransaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE directory_users IN EXCLUSIVE MODE`);
    if (await hasUsers(tx)) return;
    const email = normEmail(process.env.DIRECTORY_ADMIN_EMAIL ?? "");
    const password = process.env.DIRECTORY_ADMIN_PASSWORD ?? "";
    if (!EMAIL_RE.test(email) || !password || Buffer.byteLength(password) > 72) {
      throw new Error("Set a valid DIRECTORY_ADMIN_EMAIL and DIRECTORY_ADMIN_PASSWORD (1-72 bytes)");
    }
    await insertAdmin({ email, name: "Admin", passwordHash: await hash(password, 12) }, tx);
  });
}
main().catch(() => { console.error("Admin seed failed; check environment and database setup."); process.exitCode = 1; });
