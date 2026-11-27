import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { requireVerifiedUser, sessionUser } from "@/lib/auth/guard";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { handle } from "@/lib/http/handle";
import { validatePassword } from "@/lib/password-policy";
import { changeUserPassword } from "@/repositories/users.repository";
import { invalid, jsonBody, object } from "@/services/validation.service";

export const POST = handle(async (request: Request) => {
  const user = await requireVerifiedUser();
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new AppError(415, "Send the password change as JSON.");
  const { currentPassword, newPassword } = object(await jsonBody(request), ["currentPassword", "newPassword"]);
  if (!user.mustChangePassword) {
    if (typeof currentPassword !== "string" || !currentPassword) invalid("currentPassword", "Enter your current password.");
    if (Buffer.byteLength(currentPassword) > 72 || !await compare(currentPassword, user.passwordHash)) {
      invalid("currentPassword", "Current password is incorrect.");
    }
  }
  if (typeof newPassword !== "string") invalid("newPassword", "Enter a new password.");
  if (Buffer.byteLength(newPassword) <= 72 && await compare(newPassword, user.passwordHash)) {
    invalid("newPassword", "Choose a password you haven't used here before.");
  }
  const error = validatePassword(newPassword);
  if (error) invalid("newPassword", error);

  const updated = await changeUserPassword(user.id, user.sessionVersion, await hash(newPassword, 12));
  if (!updated) throw new AppError(401, "Sign in required");
  const token = await createSession(user.id, updated.sessionVersion);
  const item = sessionUser({ ...user, mustChangePassword: false });
  const response = NextResponse.json({ item }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return response;
});
