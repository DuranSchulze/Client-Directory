import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

describe("safeNext", () => {
  beforeEach(() => { vi.stubGlobal("window", { location: { origin: "http://app.test" } }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps a granted deep link with its query", async () => {
    const { safeNext } = await import("@/app/login/login-form");
    expect(safeNext("/clients?id=12", ["directory"])).toBe("http://app.test/clients?id=12");
    expect(safeNext("/clients/", ["directory"])).toBe("http://app.test/clients/");
  });
  it("falls back to home for unknown, auth, API and ungranted paths", async () => {
    const { safeNext } = await import("@/app/login/login-form");
    for (const next of ["/missing-page", "/clients/12", "/accounts/anything", "/change-password", "/login", "/api/users/8/temporary-password", "/accounts", "//evil.test/x"]) {
      expect(safeNext(next, ["directory"])).toBe("/clients");
    }
  });
});
