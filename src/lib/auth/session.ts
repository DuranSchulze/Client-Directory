import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "directory_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export type Session = { userId: number; ver: number };
function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(secret);
}
// Build-time route collection has no runtime secrets; every runtime import validates.
if (process.env.NEXT_PHASE !== "phase-production-build") signingKey();

export async function createSession(userId: number, ver: number): Promise<string> {
  return new SignJWT({ ver }).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(signingKey());
}
export async function verifySession(token: string): Promise<Session | null> {
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], requiredClaims: ["sub", "iat", "exp", "ver"] });
    const userId = Number(payload.sub);
    const { ver } = payload;
    return Number.isSafeInteger(userId) && userId > 0 && typeof ver === "number" && Number.isSafeInteger(ver) && ver >= 0
      ? { userId, ver } : null;
  } catch { return null; }
}

export function sessionCookieOptions(request: Request, maxAge = SESSION_SECONDS) {
  return {
    httpOnly: true, sameSite: "lax" as const, path: "/", maxAge,
    secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
  };
}
