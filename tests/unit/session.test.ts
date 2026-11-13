import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", "test-secret-with-at-least-32-characters");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("sessions", () => {
  it("signs HS256 sessions for eight hours and rejects tampering and expiry", async () => {
    vi.useFakeTimers();
    const { createSession, verifySession } = await import("@/lib/auth/session");
    const token = await createSession(7);
    expect(await verifySession(token)).toEqual({ userId: 7 });
    const [header, payload, signature] = token.split(".");
    expect(await verifySession(`${header}.${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`)).toBeNull();
    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(await verifySession(token)).toBeNull();
  });
  it("rejects tokens without an expiry or with an invalid identity", async () => {
    const { verifySession } = await import("@/lib/auth/session");
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    const noExpiry = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("7").setIssuedAt().sign(key);
    expect(await verifySession(noExpiry)).toBeNull();
    const invalid = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("-1").setIssuedAt().setExpirationTime("8h").sign(key);
    expect(await verifySession(invalid)).toBeNull();
  });
  it.each(["", "short"])("fails module startup for an invalid secret", async (secret) => {
    vi.stubEnv("SESSION_SECRET", secret);
    await expect(import("@/lib/auth/session")).rejects.toThrow("SESSION_SECRET");
  });
});
