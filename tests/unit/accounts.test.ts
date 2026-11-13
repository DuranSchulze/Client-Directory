import { beforeEach, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api-types";
import type { RouteKey } from "@/lib/routes";
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), findRole: vi.fn(), findOwner: vi.fn(), insertRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn(), listRoles: vi.fn(), findUser: vi.fn(), listUsers: vi.fn(), insertUser: vi.fn(), updateUser: vi.fn(), owners: vi.fn(), hash: vi.fn(), session: vi.fn() }));
vi.mock("@/db", () => ({ withTransaction: m.transaction }));
vi.mock("bcryptjs", () => ({ hash: m.hash }));
vi.mock("@/lib/auth/get-session", () => ({ getSession: m.session }));
vi.mock("@/repositories/roles.repository", () => ({ lockAccounts: m.lock, findRole: m.findRole, findOwnerRole: m.findOwner, insertRole: m.insertRole, updateRole: m.updateRole, deleteRole: m.deleteRole, listRoles: m.listRoles }));
vi.mock("@/repositories/users.repository", () => ({ findUserById: m.findUser, listUsers: m.listUsers, insertAdmin: m.insertUser, updateUserRole: m.updateUser, countActiveOwners: m.owners }));
import { createRole, patchRole, removeRole, createAccount, patchAccountRole, getAccounts, getRoles } from "@/services/accounts.service";

const tx = { transaction: true };
let roles: Map<number, Role>;
let people: Map<number, { id: number; email: string; name: string; roleId: number; active: boolean; passwordHash: string; createdAt: Date }>;
function person(id: number) { const p = people.get(id); return p ? { ...p, role: roles.get(p.roleId)! } : null; }
const account = { name: " New Person ", email: " NEW@EXAMPLE.TEST ", password: "secret", roleId: 3 };
beforeEach(() => {
  vi.resetAllMocks();
  roles = new Map([
    [1, { id: 1, name: "Owner", routes: [], locked: true, users: 2 }],
    [2, { id: 2, name: "Managers", routes: ["accounts"], locked: false, users: 0 }],
    [3, { id: 3, name: "Importers", routes: ["import"], locked: false, users: 0 }],
  ]);
  people = new Map([1, 2].map((id) => [id, { id, email: `user${id}@example.test`, name: `Person ${id}`, roleId: 1, active: true, passwordHash: "private-hash", createdAt: new Date("2026-01-01T00:00:00Z") }]));
  m.transaction.mockImplementation((fn) => fn(tx));
  m.session.mockResolvedValue({ userId: 1 });
  m.findRole.mockImplementation((id) => roles.get(id) ?? null);
  m.findOwner.mockImplementation(() => roles.get(1));
  m.findUser.mockImplementation((id) => person(id));
  m.listRoles.mockImplementation(() => [...roles.values()]); m.listUsers.mockImplementation(() => [...people.keys()].map(person));
  m.owners.mockResolvedValue(2); m.hash.mockResolvedValue("hashed-password");
  m.insertRole.mockImplementation((value) => { const row = { id: 4, locked: false, users: 0, ...value }; roles.set(4, row); return row; });
  m.updateRole.mockImplementation((id, value) => roles.set(id, { ...roles.get(id)!, ...value }));
  m.deleteRole.mockImplementation((id) => roles.delete(id));
  m.insertUser.mockImplementation((value) => { const row = { id: 3, active: true, createdAt: new Date("2026-01-01T00:00:00Z"), ...value }; people.set(3, row); return row; });
  m.updateUser.mockImplementation((id, roleId) => people.set(id, { ...people.get(id)!, roleId }));
});
it("creates trimmed roles with canonical routes and a numeric user count, under the lock", async () => {
  expect(await createRole(1, { name: " Team ", routes: ["accounts", "directory", "accounts"] })).toEqual({ id: 4, name: "Team", locked: false, users: 0, routes: ["directory", "accounts"] });
  expect(m.lock).toHaveBeenCalledWith(tx);
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.findUser.mock.invocationCallOrder[0]);
  expect(m.insertRole).toHaveBeenCalledWith({ name: "Team", routes: ["directory", "accounts"] }, tx);
});
it.each([{ name: "", routes: ["accounts"] }, { name: " ", routes: ["accounts"] }, { name: "x".repeat(201), routes: ["accounts"] }, { name: "Team", routes: [] }, { name: "Team", routes: ["unknown"] }, { name: "Team", routes: "accounts" }, { name: "Team", routes: [null] }])("validates role input %j", async (body) => {
  await expect(createRole(1, body)).rejects.toMatchObject({ status: 400 });
  expect(m.insertRole).not.toHaveBeenCalled();
});
it("refuses locked role edits/deletes and unknown/in-use roles", async () => {
  for (const promise of [patchRole(1, 1, { name: "Changed", routes: ["accounts"] }), removeRole(1, 1)]) await expect(promise).rejects.toMatchObject({ status: 400, message: "Locked role cannot be edited or deleted" });
  await expect(patchRole(1, 99, { name: "Missing", routes: ["accounts"] })).rejects.toMatchObject({ status: 404 });
  await expect(removeRole(1, 99)).rejects.toMatchObject({ status: 404 });
  roles.get(2)!.users = 1;
  await expect(removeRole(1, 2)).rejects.toMatchObject({ status: 409, message: "Role is in use" });
  expect(m.updateRole).not.toHaveBeenCalled(); expect(m.deleteRole).not.toHaveBeenCalled();
});
it("edits and deletes unused roles", async () => {
  expect(await patchRole(1, 3, { name: "Both", routes: ["import", "directory"] })).toMatchObject({ name: "Both", routes: ["directory", "import"] });
  await removeRole(1, 2);
  expect(m.deleteRole).toHaveBeenCalledWith(2, tx);
});
it("protects your own Accounts access during role edits and assignments", async () => {
  people.get(1)!.roleId = 2;
  await expect(patchRole(1, 2, { name: "No accounts", routes: ["import"] })).rejects.toMatchObject({ status: 400, message: "You would lose access to Accounts" });
  await expect(patchAccountRole(1, 1, { roleId: 3 })).rejects.toMatchObject({ status: 400, message: "You would lose access to Accounts" });
});
it("protects the last active Owner, but allows another Owner or an inactive target to move", async () => {
  m.owners.mockResolvedValueOnce(1);
  await expect(patchAccountRole(1, 2, { roleId: 2 })).rejects.toMatchObject({ status: 400, message: "Cannot leave zero active Owner accounts" });
  expect(await patchAccountRole(1, 2, { roleId: 2 })).toMatchObject({ role: { id: 2, name: "Managers" } });
  people.get(2)!.roleId = 1; people.get(2)!.active = false;
  expect(await patchAccountRole(1, 2, { roleId: 3 })).toMatchObject({ active: false, role: { id: 3 } });
});
it("re-reads the actor after the lock and refuses inactive, missing, or revoked actors for every write", async () => {
  const writes = [() => createRole(1, { name: "New", routes: ["import"] }), () => patchRole(1, 3, { name: "New", routes: ["import"] }), () => removeRole(1, 3), () => createAccount(1, account), () => patchAccountRole(1, 2, { roleId: 3 })];
  for (const operation of writes) {
    people.get(1)!.active = false;
    await expect(operation()).rejects.toMatchObject({ status: 401 });
    people.get(1)!.active = true; people.get(1)!.roleId = 3;
    await expect(operation()).rejects.toMatchObject({ status: 403, message: "You don't have access to this page" });
    people.get(1)!.roleId = 1;
  }
  m.findUser.mockResolvedValueOnce(null);
  await expect(createRole(1, { name: "Missing actor", routes: ["import"] })).rejects.toMatchObject({ status: 401 });
  m.lock.mockImplementationOnce(() => { people.get(1)!.roleId = 3; });
  await expect(createRole(1, { name: "Revoked while waiting", routes: ["import"] })).rejects.toMatchObject({ status: 403 });
});
it("creates accounts with bcrypt 12 and normalized email, and never returns passwords or hashes", async () => {
  const result = await createAccount(1, account);
  expect(result).toEqual({ id: 3, name: "New Person", email: "new@example.test", role: { id: 3, name: "Importers" }, routes: ["import"], active: true, createdAt: "2026-01-01T00:00:00.000Z" });
  expect(m.hash).toHaveBeenCalledWith("secret", 12);
  expect(JSON.stringify(await getAccounts())).not.toContain("private-hash");
  expect((await getRoles())[0].routes).toEqual(["directory", "import", "accounts"]);
});
it.each([{ name: " " }, { name: "x".repeat(201) }, { email: "bad" }, { email: 3 }, { password: "" }, { password: "x".repeat(73) }, { password: "é".repeat(37) }, { roleId: -1 }, { roleId: "bad" }, { active: false }, { passwordHash: "supplied" }])("validates account input and rejects unknown keys: %j", async (change) => {
  await expect(createAccount(1, { ...account, ...change })).rejects.toMatchObject({ status: 400 });
  expect(m.insertUser).not.toHaveBeenCalled();
});
it("accepts a 72-byte UTF-8 password and rejects extra assignment keys and missing roles/users", async () => {
  await createAccount(1, { ...account, password: "é".repeat(36) });
  await expect(patchAccountRole(1, 2, { roleId: 3, active: false })).rejects.toMatchObject({ status: 400, field: "active" });
  await expect(createAccount(1, { ...account, roleId: 99 })).rejects.toMatchObject({ status: 404, message: "Role not found" });
  await expect(patchAccountRole(1, 99, { roleId: 3 })).rejects.toMatchObject({ status: 404, message: "User not found" });
  await expect(patchAccountRole(1, 2, { roleId: 99 })).rejects.toMatchObject({ status: 404, message: "Role not found" });
});
it("maps unique violations to the specified conflict messages", async () => {
  const duplicate = { cause: { code: "23505" } };
  m.insertRole.mockRejectedValueOnce(duplicate);
  await expect(createRole(1, { name: "Duplicate", routes: ["import"] })).rejects.toMatchObject({ status: 409, message: "Role name already exists" });
  m.updateRole.mockRejectedValueOnce(duplicate);
  await expect(patchRole(1, 3, { name: "Duplicate", routes: ["import"] })).rejects.toMatchObject({ status: 409, message: "Role name already exists" });
  m.insertUser.mockRejectedValueOnce(duplicate);
  await expect(createAccount(1, account)).rejects.toMatchObject({ status: 409, message: "Email already exists" });
});
it("returns the frozen API response envelopes and requires accounts on all endpoints", async () => {
  const roleRoutes = await import("@/app/api/roles/route"), role = await import("@/app/api/roles/[id]/route"), accountRoutes = await import("@/app/api/users/route"), user = await import("@/app/api/users/[id]/route");
  const request = (json: unknown) => new Request("https://example.test/api", { method: "POST", body: JSON.stringify(json) });
  expect((await (await roleRoutes.GET()).json()).items).toHaveLength(3);
  const createdRole = await roleRoutes.POST(request({ name: "New", routes: ["import"] }));
  expect(createdRole.status).toBe(201); expect((await createdRole.json()).item.users).toBe(0);
  expect((await (await role.PATCH(request({ name: "Edit", routes: ["directory"] }), { params: Promise.resolve({ id: "3" }) })).json()).item.name).toBe("Edit");
  const createdAccount = await accountRoutes.POST(request(account));
  expect(createdAccount.status).toBe(201); expect((await createdAccount.json()).item.role.id).toBe(3);
  expect((await (await accountRoutes.GET()).json()).items).toHaveLength(3);
  expect((await (await user.PATCH(request({ roleId: 2 }), { params: Promise.resolve({ id: "2" }) })).json()).item.role.id).toBe(2);
  expect(await (await role.DELETE(request({}), { params: Promise.resolve({ id: "4" }) })).json()).toEqual({ ok: true });
  for (const grant of ["directory", "import"] as RouteKey[]) {
    roles.get(2)!.routes = [grant]; people.get(1)!.roleId = 2;
    for (const call of [() => roleRoutes.GET(), () => roleRoutes.POST(request({})), () => role.PATCH(request({}), { params: Promise.resolve({ id: "3" }) }), () => role.DELETE(request({}), { params: Promise.resolve({ id: "3" }) }), () => accountRoutes.GET(), () => accountRoutes.POST(request({})), () => user.PATCH(request({}), { params: Promise.resolve({ id: "2" }) })]) expect((await call()).status).toBe(403);
  }
  m.session.mockResolvedValue(null); expect((await roleRoutes.GET()).status).toBe(401);
});
