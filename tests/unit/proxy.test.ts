import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
beforeEach(() => vi.stubEnv("SESSION_SECRET", "test-secret-with-at-least-32-characters"));
afterEach(() => vi.unstubAllEnvs());
it("redirects pages with next, gates APIs and leaves login open", async () => {
  const { proxy } = await import("@/proxy");
  const page = await proxy(new NextRequest("https://example.com/clients?q=acme"));
  const redirect = new URL(page.headers.get("location")!);
  expect(redirect.pathname).toBe("/login");
  expect(redirect.searchParams.get("next")).toBe("/clients?q=acme");
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const response = await proxy(new NextRequest("https://example.com/api/companies", { method }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in required" });
  }
  expect((await proxy(new NextRequest("https://example.com/login"))).headers.get("x-middleware-next")).toBe("1");
  expect((await proxy(new NextRequest("https://example.com/api/auth/login", { method: "POST" }))).headers.get("x-middleware-next")).toBe("1");
  for (const cookie of ["", "directory_session=revoked-token"]) {
    expect((await proxy(new NextRequest("https://example.com/api/auth/logout", { method: "POST", headers: { cookie } }))).headers.get("x-middleware-next")).toBe("1");
  }
  const { createSession } = await import("@/lib/auth/session");
  const response = await proxy(new NextRequest("https://example.com/clients", { headers: { cookie: `directory_session=${await createSession(7)}` } }));
  expect(response.headers.get("x-middleware-next")).toBe("1");
});
