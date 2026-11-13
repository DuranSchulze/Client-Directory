import "dotenv/config";
import { hash } from "bcryptjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withTransaction } from "../src/db";
import { EMAIL_RE, normEmail } from "../src/lib/normalize";
import { hasUsers, insertAdmin } from "../src/repositories/users.repository";
import { ensureOwnerRole, lockAccounts } from "../src/repositories/roles.repository";

export async function seedAdmin() {
  await withTransaction(async (tx) => {
    await lockAccounts(tx);
    if (await hasUsers(tx)) return;
    const email = normEmail(process.env.DIRECTORY_ADMIN_EMAIL ?? "");
    const password = process.env.DIRECTORY_ADMIN_PASSWORD ?? "";
    if (!EMAIL_RE.test(email) || !password || Buffer.byteLength(password) > 72) {
      throw new Error("Set a valid DIRECTORY_ADMIN_EMAIL and DIRECTORY_ADMIN_PASSWORD (1-72 bytes)");
    }
    const owner = await ensureOwnerRole(tx);
    await insertAdmin({ email, name: "Admin", passwordHash: await hash(password, 12), roleId: owner.id }, tx);
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void seedAdmin().catch(() => { console.error("Admin seed failed; check environment and database setup."); process.exitCode = 1; });
}
