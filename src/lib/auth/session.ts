import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "directory_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export type Session = { userId: number };
function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(secret);
}
// Build-time route collection has no runtime secrets; every runtime import validates.
if (process.env.NEXT_PHASE !== "phase-production-build") signingKey();

export async function createSession(userId: number): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(signingKey());
}
export async function verifySession(token: string): Promise<Session | null> {
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], requiredClaims: ["sub", "iat", "exp"] });
    const userId = Number(payload.sub);
    return Number.isSafeInteger(userId) && userId > 0 ? { userId } : null;
  } catch { return null; }
}
