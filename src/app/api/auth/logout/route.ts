import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { handle } from "@/lib/http/handle";

export const POST = handle(async (request: Request) => {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(request, 0));
  return response;
});
