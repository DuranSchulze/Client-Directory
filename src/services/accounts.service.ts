import { hash } from "bcryptjs";
import { withTransaction, type Tx } from "@/db";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";
import { EMAIL_RE, normEmail } from "@/lib/normalize";
import { requireChangedPassword, sessionUser } from "@/lib/auth/guard";
import { decryptTemp, encryptTemp, temporaryPassword } from "@/lib/auth/password";
import type { Account, Role, RoleInput } from "@/lib/api-types";
import * as roles from "@/repositories/roles.repository";
import * as users from "@/repositories/users.repository";
import { id, invalid, object } from "./validation.service";

function name(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) invalid("name", "Name must be 1-200 characters");
  return value.trim();
}
function roleInput(body: unknown): RoleInput {
  const input = object(body, ["name", "routes"]);
  if (!Array.isArray(input.routes) || !input.routes.length || input.routes.some((r) => !ROUTES.includes(r))) invalid("routes", "Choose at least one known route");
  return { name: name(input.name), routes: ROUTES.filter((r) => (input.routes as unknown[]).includes(r)) };
}
function accountDto(user: users.JoinedUser): Account {
  return { ...sessionUser(user), active: user.active, createdAt: user.createdAt.toISOString(), hasTemporaryPassword: user.mustChangePassword && !!user.tempPasswordEnc };
}
function roleDto(role: Role): Role { return { ...role, routes: ROUTES.filter((r) => role.locked && role.name === "Owner" || role.routes.includes(r)) }; }
type AccountActor = Pick<users.JoinedUser, "id" | "sessionVersion">;
async function write<T>(session: AccountActor, conflict: string, fn: (tx: Tx, actor: users.JoinedUser) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(async (tx) => {
      await roles.lockAccounts(tx);
      const actor = await users.findUserById(session.id, tx);
      if (!actor || !actor.active || actor.sessionVersion !== session.sessionVersion) throw new AppError(401, "Sign in required");
      requireChangedPassword(actor);
      if (!sessionUser(actor).routes.includes("accounts")) throw new AppError(403, "You don't have access to this page");
      return fn(tx, actor);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, conflict);
    throw error;
  }
}
export async function getRoles() { return (await roles.listRoles()).map(roleDto); }
export async function getAccounts() { return (await users.listUsers()).map(accountDto); }
export async function createRole(session: AccountActor, body: unknown) {
  const input = roleInput(body);
  return write(session, "Role name already exists", async (tx) => {
    const row = await roles.insertRole(input, tx);
    return roleDto((await roles.findRole(row.id, tx))!);
  });
}
export async function patchRole(session: AccountActor, roleId: number, body: unknown) {
  const input = roleInput(body);
  return write(session, "Role name already exists", async (tx, actor) => {
    const role = await roles.findRole(roleId, tx);
    if (!role) throw new AppError(404, "Role not found");
    if (role.locked) throw new AppError(400, "Locked role cannot be edited or deleted");
    if (actor.role.id === roleId && !input.routes.includes("accounts")) throw new AppError(400, "You would lose access to Accounts");
    await roles.updateRole(roleId, input, tx);
    return roleDto((await roles.findRole(roleId, tx))!);
  });
}
export async function removeRole(session: AccountActor, roleId: number) {
  await write(session, "Role name already exists", async (tx) => {
    const role = await roles.findRole(roleId, tx);
    if (!role) throw new AppError(404, "Role not found");
    if (role.locked) throw new AppError(400, "Locked role cannot be edited or deleted");
    if (role.users) throw new AppError(409, "Role is in use");
    await roles.deleteRole(roleId, tx);
  });
}
export async function createAccount(session: AccountActor, body: unknown) {
  const input = object(body, ["name", "email", "roleId"]);
  const displayName = name(input.name), roleId = id(input.roleId, "roleId");
  if (typeof input.email !== "string" || !EMAIL_RE.test(normEmail(input.email))) invalid("email", "Enter a valid email address");
  const email = normEmail(input.email);
  const password = temporaryPassword(email);
  const passwordHash = await hash(password, 12);
  const tempPasswordEnc = encryptTemp(password);
  return write(session, "Email already exists", async (tx) => {
    if (!await roles.findRole(roleId, tx)) throw new AppError(404, "Role not found");
    const row = await users.insertAccount({ name: displayName, email, passwordHash, tempPasswordEnc, roleId }, tx);
    return { ...accountDto((await users.findUserById(row.id, tx))!), temporaryPassword: password };
  });
}
export async function resetPassword(session: AccountActor, userId: number) {
  return write(session, "Could not reset password", async (tx) => {
    if (session.id === userId) throw new AppError(400, "Use Change password to reset your own password");
    const target = await users.findUserById(userId, tx);
    if (!target) throw new AppError(404, "User not found");
    const password = temporaryPassword(target.email);
    await users.resetUserPassword(userId, { passwordHash: await hash(password, 12), tempPasswordEnc: encryptTemp(password) }, tx);
    return { temporaryPassword: password };
  });
}
export async function getTemporaryPassword(session: AccountActor, userId: number) {
  if (session.id === userId) throw new AppError(400, "You cannot view your own temporary password");
  return write(session, "Could not read temporary password", async (tx) => {
    const target = await users.findUserById(userId, tx);
    const password = target?.mustChangePassword && target.tempPasswordEnc ? decryptTemp(target.tempPasswordEnc) : null;
    if (password === null) throw new AppError(404, "No temporary password");
    return { temporaryPassword: password };
  });
}

export async function patchAccountRole(session: AccountActor, userId: number, body: unknown) {
  const roleId = id(object(body, ["roleId"]).roleId, "roleId");
  return write(session, "Email already exists", async (tx, actor) => {
    const target = await users.findUserById(userId, tx);
    if (!target) throw new AppError(404, "User not found");
    const role = await roles.findRole(roleId, tx);
    if (!role) throw new AppError(404, "Role not found");
    if (userId === actor.id && !roleDto(role).routes.includes("accounts")) throw new AppError(400, "You would lose access to Accounts");
    const owner = await roles.findOwnerRole(tx);
    if (owner && target.active && target.roleId === owner.id && roleId !== owner.id && await users.countActiveOwners(owner.id, tx) <= 1) throw new AppError(400, "Cannot leave zero active Owner accounts");
    await users.updateUserRole(userId, roleId, tx);
    return accountDto((await users.findUserById(userId, tx))!);
  });
}
