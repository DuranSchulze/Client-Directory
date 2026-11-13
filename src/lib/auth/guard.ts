import "server-only";
import { AppError } from "@/lib/errors";
import { findUserById } from "@/repositories/users.repository";
import { getSession } from "./get-session";

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AppError(401, "Sign in required");
  return session;
}
export async function requireRouteAccess(route: "directory") {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (!user || !user.active || user.role !== "admin" || route !== "directory") throw new AppError(403, "Access denied");
  return { email: user.email, name: user.name, role: user.role };
}
