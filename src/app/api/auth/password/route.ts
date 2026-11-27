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
  const { currentPassword, newPassword } = object(await jsonBody(request), ["currentPassword", "newPassword"]);
  if (typeof currentPassword !== "string" || !currentPassword || Buffer.byteLength(currentPassword) > 72) {
    invalid("currentPassword", "Enter a password of at most 72 bytes");
  }
  if (!await compare(currentPassword, user.passwordHash)) invalid("currentPassword", "Current password is incorrect");
  if (typeof newPassword !== "string") invalid("newPassword", "Enter a new password");
  if (newPassword === currentPassword) invalid("newPassword", "New password must differ from current password");
  const error = validatePassword(newPassword, user.email);
  if (error) invalid("newPassword", error);

  const updated = await changeUserPassword(user.id, user.sessionVersion, await hash(newPassword, 12));
  if (!updated) throw new AppError(401, "Sign in required");
  const token = await createSession(user.id, updated.sessionVersion);
  const item = sessionUser({ ...user, mustChangePassword: false });
  const response = NextResponse.json({ item }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return response;
});
