import { NextResponse } from "next/server";
import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { handle } from "@/lib/http/handle";

export const POST = handle(async (request: Request) => {
  await requireSession();
  await requireRouteAccess("directory");
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
    secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
  });
  return response;
});
