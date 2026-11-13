import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

describe.skipIf(!process.env.TEST_DATABASE_URL)("directory account persistence and lockout", () => {
  const addedUsers: number[] = [], addedRoles: number[] = [], suspendedOwners: number[] = [];
  afterEach(async () => {
    const { withTransaction } = await import("@/db");
    const { directory_users_tb: users, directory_roles_tb: roles } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    const { lockAccounts } = await import("@/repositories/roles.repository");
    await withTransaction(async (tx) => {
      await lockAccounts(tx);
      if (addedUsers.length) await tx.delete(users).where(inArray(users.id, addedUsers));
      if (addedRoles.length) await tx.delete(roles).where(inArray(roles.id, addedRoles));
      if (suspendedOwners.length) await tx.update(users).set({ active: true }).where(inArray(users.id, suspendedOwners));
    });
    addedUsers.length = addedRoles.length = suspendedOwners.length = 0;
  }, 30000);
  async function setup() {
    const tag = randomUUID();
    const { withTransaction } = await import("@/db");
    const { directory_users_tb: users } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const repo = await import("@/repositories/roles.repository");
    const { insertAdmin } = await import("@/repositories/users.repository");
    return withTransaction(async (tx) => {
      await repo.lockAccounts(tx);
      const owner = await repo.ensureOwnerRole(tx);
      // Isolate the Owner-count invariant from the test branch's seeded accounts, restoring them in cleanup.
      const previous = await tx.update(users).set({ active: false }).where(and(eq(users.roleId, owner.id), eq(users.active, true))).returning({ id: users.id });
      suspendedOwners.push(...previous.map((u) => u.id));
      const manager = await repo.insertRole({ name: `Accounts ${tag}`, routes: ["accounts"] }, tx); addedRoles.push(manager.id);
      const a = await insertAdmin({ name: "Owner A", email: `a-${tag}@example.test`, passwordHash: "not-a-login", roleId: owner.id }, tx);
      const b = await insertAdmin({ name: "Owner B", email: `b-${tag}@example.test`, passwordHash: "not-a-login", roleId: owner.id }, tx);
      addedUsers.push(a.id, b.id);
      return { a, b, owner, manager, tag };
    });
  }
  it("creates a role and bcrypt account, then refuses removal of the last active Owner", async () => {
    const { a, b, manager, tag } = await setup();
    const { createRole, createAccount, patchAccountRole } = await import("@/services/accounts.service");
    const { findUserByEmail } = await import("@/repositories/users.repository");
    const { compare, getRounds } = await import("bcryptjs");
    const role = await createRole(a.id, { name: `Import ${tag}`, routes: ["import"] }); addedRoles.push(role.id);
    const account = await createAccount(a.id, { name: "New account", email: ` NEW-${tag}@EXAMPLE.TEST `, password: "correct password", roleId: role.id }); addedUsers.push(account.id);
    expect(account).toMatchObject({ email: `new-${tag}@example.test`, role: { id: role.id }, routes: ["import"], active: true });
    const stored = await findUserByEmail(account.email);
    expect(await compare("correct password", stored!.passwordHash)).toBe(true); expect(getRounds(stored!.passwordHash)).toBe(12);
    expect(JSON.stringify(account)).not.toContain(stored!.passwordHash);
    await patchAccountRole(a.id, b.id, { roleId: manager.id });
    await expect(patchAccountRole(b.id, a.id, { roleId: manager.id })).rejects.toMatchObject({ status: 400, message: "Cannot leave zero active Owner accounts" });
  }, 60000);
  it("serializes two active Owners demoting each other and leaves exactly one active Owner", async () => {
    const { a, b, manager, owner } = await setup();
    const { patchAccountRole } = await import("@/services/accounts.service");
    const { countActiveOwners } = await import("@/repositories/users.repository");
    const results = await Promise.allSettled([patchAccountRole(a.id, b.id, { roleId: manager.id }), patchAccountRole(b.id, a.id, { roleId: manager.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 400, message: "Cannot leave zero active Owner accounts" } });
    expect(await countActiveOwners(owner.id)).toBe(1);
  }, 60000);
  it("counts a role's account in list/detail queries and refuses DELETE with the specified 409", async () => {
    const { a, owner, tag } = await setup();
    const { createRole, createAccount } = await import("@/services/accounts.service");
    const { listRoles, findRole, findOwnerRole } = await import("@/repositories/roles.repository");
    const { findUserById } = await import("@/repositories/users.repository");
    const role = await createRole(a.id, { name: `Counted ${tag}`, routes: ["import"] }); addedRoles.push(role.id);
    const account = await createAccount(a.id, { name: "One account", email: `counted-${tag}@example.test`, password: "password", roleId: role.id }); addedUsers.push(account.id);
    expect((await findRole(role.id))?.users).toBe(1);
    expect((await listRoles()).find((r) => r.id === role.id)?.users).toBe(1);
    // Suspended seeded Owners still belong to Owner and must count too.
    expect((await findOwnerRole())?.users).toBe(owner.users + 2);
    const guard = await import("@/lib/auth/guard");
    const access = vi.spyOn(guard, "requireRouteAccess").mockResolvedValue(guard.sessionUser((await findUserById(a.id))!));
    try {
      const { DELETE } = await import("@/app/api/roles/[id]/route");
      const response = await DELETE(new Request(`https://example.test/api/roles/${role.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: String(role.id) }) });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Role is in use" });
      expect(await findRole(role.id)).not.toBeNull();
    } finally { access.mockRestore(); }
  }, 60000);
  it("denies an actor whose Accounts grant is removed while its request waits for the lock", async () => {
    const { a, manager, tag } = await setup();
    const { createAccount, createRole } = await import("@/services/accounts.service");
    const { withTransaction } = await import("@/db");
    const { lockAccounts, updateRole, listRoles } = await import("@/repositories/roles.repository");
    const { sql } = await import("drizzle-orm");
    const actor = await createAccount(a.id, { name: "Manager", email: `manager-${tag}@example.test`, password: "password", roleId: manager.id }); addedUsers.push(actor.id);
    let outcome: Promise<PromiseSettledResult<Awaited<ReturnType<typeof createRole>>>[]> | undefined;
    await withTransaction(async (tx) => {
      await lockAccounts(tx);
      outcome = Promise.allSettled([createRole(actor.id, { name: `Denied ${tag}`, routes: ["import"] })]);
      let blocked = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const result = await tx.execute<{ blocked: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks WHERE relation = 'public.directory_roles'::regclass AND mode = 'ShareRowExclusiveLock' AND NOT granted) AS blocked`);
        if (result.rows[0].blocked) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true);
      await updateRole(manager.id, { name: manager.name, routes: ["import"] }, tx);
    });
    const [result] = await outcome!;
    if (result.status === "fulfilled") addedRoles.push(result.value.id);
    expect(result).toMatchObject({ status: "rejected", reason: { status: 403, message: "You don't have access to this page" } });
    expect((await listRoles()).some((r) => r.name === `Denied ${tag}`)).toBe(false);
  }, 60000);
});
