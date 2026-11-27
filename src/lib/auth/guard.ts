import "server-only";
import { AppError } from "@/lib/errors";
import { findUserById, type JoinedUser } from "@/repositories/users.repository";
import { getSession } from "./get-session";
import { ROUTES, type RouteKey } from "@/lib/routes";
import type { SessionUser } from "@/lib/api-types";

export function sessionUser(user: JoinedUser): SessionUser {
  const { id, email, name, role, mustChangePassword } = user;
  return { id, email, name, role: { id: role.id, name: role.name }, routes: ROUTES.filter((r) => role.locked && role.name === "Owner" || role.routes.includes(r)), mustChangePassword };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AppError(401, "Sign in required");
  return session;
}
export async function requireVerifiedUser() {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (user && user.sessionVersion !== session.ver) throw new AppError(401, "Sign in required");
  if (!user || !user.active) throw new AppError(403, "Access denied");
  return user;
}
export function requireChangedPassword(user: Pick<JoinedUser, "mustChangePassword">) {
  if (user.mustChangePassword) throw new AppError(403, "Password change required");
}
export async function rejectPendingPasswordChange() {
  const session = await getSession();
  if (!session) return;
  const user = await findUserById(session.userId);
  if (user?.active && user.sessionVersion === session.ver) requireChangedPassword(user);
}
export async function requireActiveUser() {
  const user = await requireVerifiedUser();
  requireChangedPassword(user);
  return sessionUser(user);
}
export async function requireRouteAccess(route: RouteKey) {
  const row = await requireVerifiedUser();
  requireChangedPassword(row);
  const user = sessionUser(row);
  if (!user.routes.includes(route)) throw new AppError(403, "You don't have access to this page");
  return { ...user, sessionVersion: row.sessionVersion };
}
