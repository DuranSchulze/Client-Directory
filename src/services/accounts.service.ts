import { hash } from "bcryptjs";
import { withTransaction, type Tx } from "@/db";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";
import { EMAIL_RE, normEmail } from "@/lib/normalize";
import { sessionUser } from "@/lib/auth/guard";
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
function accountDto(user: users.JoinedUser): Account { return { ...sessionUser(user), active: user.active, createdAt: user.createdAt.toISOString() }; }
function roleDto(role: Role): Role { return { ...role, routes: ROUTES.filter((r) => role.locked && role.name === "Owner" || role.routes.includes(r)) }; }
async function write<T>(actorId: number, conflict: string, fn: (tx: Tx, actor: users.JoinedUser) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(async (tx) => {
      await roles.lockAccounts(tx);
      const actor = await users.findUserById(actorId, tx);
      if (!actor || !actor.active) throw new AppError(401, "Sign in required");
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
export async function createRole(actorId: number, body: unknown) {
  const input = roleInput(body);
  return write(actorId, "Role name already exists", async (tx) => {
    const row = await roles.insertRole(input, tx);
    return roleDto((await roles.findRole(row.id, tx))!);
  });
}
export async function patchRole(actorId: number, roleId: number, body: unknown) {
  const input = roleInput(body);
  return write(actorId, "Role name already exists", async (tx, actor) => {
    const role = await roles.findRole(roleId, tx);
    if (!role) throw new AppError(404, "Role not found");
    if (role.locked) throw new AppError(400, "Locked role cannot be edited or deleted");
    if (actor.role.id === roleId && !input.routes.includes("accounts")) throw new AppError(400, "You would lose access to Accounts");
    await roles.updateRole(roleId, input, tx);
    return roleDto((await roles.findRole(roleId, tx))!);
  });
}
export async function removeRole(actorId: number, roleId: number) {
  await write(actorId, "Role name already exists", async (tx) => {
    const role = await roles.findRole(roleId, tx);
    if (!role) throw new AppError(404, "Role not found");
    if (role.locked) throw new AppError(400, "Locked role cannot be edited or deleted");
    if (role.users) throw new AppError(409, "Role is in use");
    await roles.deleteRole(roleId, tx);
  });
}
export async function createAccount(actorId: number, body: unknown) {
  const input = object(body, ["name", "email", "password", "roleId"]);
  const displayName = name(input.name), roleId = id(input.roleId, "roleId");
  if (typeof input.email !== "string" || !EMAIL_RE.test(normEmail(input.email))) invalid("email", "Enter a valid email address");
  if (typeof input.password !== "string" || !input.password || Buffer.byteLength(input.password) > 72) invalid("password", "Enter a password of at most 72 bytes");
  const email = normEmail(input.email), passwordHash = await hash(input.password, 12);
  return write(actorId, "Email already exists", async (tx) => {
    if (!await roles.findRole(roleId, tx)) throw new AppError(404, "Role not found");
    const row = await users.insertAdmin({ name: displayName, email, passwordHash, roleId }, tx);
    return accountDto((await users.findUserById(row.id, tx))!);
  });
}
export async function patchAccountRole(actorId: number, userId: number, body: unknown) {
  const roleId = id(object(body, ["roleId"]).roleId, "roleId");
  return write(actorId, "Email already exists", async (tx, actor) => {
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
