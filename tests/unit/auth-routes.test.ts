import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { ROUTES } from "@/lib/routes";

const mocks = vi.hoisted(() => ({ findUserByEmail: vi.fn(), findUserById: vi.fn(), getSession: vi.fn() }));
vi.mock("@/repositories/users.repository", () => mocks);
vi.mock("@/lib/auth/get-session", () => ({ getSession: mocks.getSession }));
const user = { id: 7, email: "admin@example.com", name: "Admin", roleId: 1, role: { id: 1, name: "Owner", locked: true, routes: [...ROUTES] }, active: true, passwordHash: "", createdAt: new Date() };
const publicUser = { id: user.id, email: user.email, name: user.name, role: { id: 1, name: "Owner" }, routes: [...ROUTES] };
let ip = 0;
function request(path: string, body?: unknown) {
  return new Request(`https://directory.example/api/auth/${path}`, {
    method: path === "me" ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${++ip}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "test-secret-with-at-least-32-characters");
  vi.clearAllMocks();
  user.passwordHash = await hash("correct-password", 4);
  mocks.findUserByEmail.mockResolvedValue(user);
  mocks.findUserById.mockResolvedValue(user);
  mocks.getSession.mockResolvedValue({ userId: user.id });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("auth routes", () => {
  it("signs in, lowercases email and only returns public user fields", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(request("login", { email: " ADMIN@EXAMPLE.COM ", password: "correct-password" }));
    expect(response.status).toBe(200);
    expect(mocks.findUserByEmail).toHaveBeenCalledWith("admin@example.com");
    expect(await response.json()).toEqual({ item: publicUser });
    const cookie = response.headers.get("set-cookie")!;
    for (const value of ["directory_session=", "HttpOnly", "Secure", "SameSite=lax", "Max-Age=28800", "Path=/"]) expect(cookie).toContain(value);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns identical 401 errors for unknown, wrong-password and inactive users", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const bodies = [];
    for (const found of [null, user, { ...user, active: false }]) {
      mocks.findUserByEmail.mockResolvedValue(found);
      const response = await POST(request("login", { email: user.email, password: found === user ? "wrong" : "correct-password" }));
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
      bodies.push(await response.json());
    }
    expect(bodies).toEqual(Array(3).fill({ error: "Invalid email or password" }));
  });
  it("validates input and malformed JSON", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    for (const [body, field] of [[{}, "email"], [{ email: user.email, password: "" }, "password"], [{ email: user.email, password: "x".repeat(73) }, "password"]] as const) {
      const response = await POST(request("login", body));
      expect(response.status).toBe(400);
      expect((await response.json()).field).toBe(field);
    }
    expect((await POST(new Request("http://localhost/api/auth/login", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("limits login attempts by IP and permits attempts after the window", async () => {
    vi.useFakeTimers();
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost/api/auth/login", { method: "POST", headers: { "x-forwarded-for": "198.51.100.1" }, body: "{}" });
    for (let i = 0; i < 5; i++) expect((await POST(req.clone())).status).toBe(400);
    expect((await POST(req.clone())).status).toBe(429);
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect((await POST(req.clone())).status).toBe(400);
  });
  it.each([true, false])("allows six successful logins with forwarded IP header = %s", async (forwarded) => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: forwarded ? { "x-forwarded-for": "203.0.113.1" } : {},
      body: JSON.stringify({ email: user.email, password: "correct-password" }),
    });
    for (let i = 0; i < 6; i++) expect((await POST(req.clone())).status).toBe(200);
  });
  it("resets failures on success and still blocks repeated wrong passwords", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = (password: string) => new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { "x-forwarded-for": "203.0.113.2" },
      body: JSON.stringify({ email: user.email, password }),
    });
    for (let i = 0; i < 4; i++) expect((await POST(req("wrong-password"))).status).toBe(401);
    expect((await POST(req("correct-password"))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await POST(req("wrong-password"))).status).toBe(401);
    expect((await POST(req("wrong-password"))).status).toBe(429);
  });
  it("blocks signed-out reads and writes, and rechecks inactive users", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const { POST } = await import("@/app/api/auth/logout/route");
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request("logout"))).status).toBe(200);
    mocks.getSession.mockResolvedValue({ userId: user.id });
    mocks.findUserById.mockResolvedValue({ ...user, active: false });
    expect((await GET()).status).toBe(403);
    expect((await POST(request("logout"))).status).toBe(200);
    mocks.findUserById.mockResolvedValue({ ...user, role: { id: 2, name: "No grants", locked: false, routes: [] } });
    expect((await GET()).status).toBe(200);
  });
  it("reads the public user and clears the session on logout", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const { POST } = await import("@/app/api/auth/logout/route");
    expect(await (await GET()).json()).toEqual({ item: publicUser });
    const response = await POST(request("logout"));
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it.each(ROUTES)("checks the %s grant from the current role on every request", async (grant) => {
    const { requireRouteAccess } = await import("@/lib/auth/guard");
    mocks.findUserById.mockResolvedValue({ ...user, role: { id: 2, name: "Limited", locked: false, routes: [grant] } });
    expect(await requireRouteAccess(grant)).toMatchObject({ role: { id: 2, name: "Limited" }, routes: [grant] });
    for (const other of ROUTES.filter((r) => r !== grant)) await expect(requireRouteAccess(other)).rejects.toMatchObject({ status: 403, message: "You don't have access to this page" });
    mocks.findUserById.mockResolvedValueOnce(null);
    await expect(requireRouteAccess(grant)).rejects.toMatchObject({ status: 403 });
  });
  it.each([[], ["import"], ["accounts"]])("me permits an active account with grants %j and logout always clears its cookie", async (...grants) => {
    const { GET } = await import("@/app/api/auth/me/route");
    const { POST } = await import("@/app/api/auth/logout/route");
    mocks.findUserById.mockResolvedValue({ ...user, role: { id: 2, name: "Limited", locked: false, routes: grants } });
    expect((await (await GET()).json()).item.routes).toEqual(grants);
    const response = await POST(request("logout"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
