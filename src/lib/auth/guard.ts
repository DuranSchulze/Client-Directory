import "server-only";
import { AppError } from "@/lib/errors";
import { findUserById, type JoinedUser } from "@/repositories/users.repository";
import { getSession } from "./get-session";
import { ROUTES, type RouteKey } from "@/lib/routes";
import type { SessionUser } from "@/lib/api-types";

export function sessionUser(user: JoinedUser): SessionUser {
  const { id, email, name, role } = user;
  return { id, email, name, role: { id: role.id, name: role.name }, routes: ROUTES.filter((r) => role.locked && role.name === "Owner" || role.routes.includes(r)) };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AppError(401, "Sign in required");
  return session;
}
export async function requireActiveUser() {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (!user || !user.active) throw new AppError(403, "Access denied");
  return sessionUser(user);
}
export async function requireRouteAccess(route: RouteKey) {
  const user = await requireActiveUser();
  if (!user.routes.includes(route)) throw new AppError(403, "You don't have access to this page");
  return user;
}
