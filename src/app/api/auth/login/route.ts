import { NextResponse } from "next/server";
import { login } from "@/lib/auth/login";
import { rejectPendingPasswordChange } from "@/lib/auth/guard";
import { clearLoginLimit, limitLogin } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { handle } from "@/lib/http/handle";

export const POST = handle(async (request: Request) => {
  await rejectPendingPasswordChange();
  limitLogin(request);
  let body: unknown;
  try { body = await request.json(); } catch { throw new AppError(400, "Invalid JSON body"); }
  const { token, item } = await login(body);
  clearLoginLimit(request);
  const response = NextResponse.json({ item }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return response;
});
