import { describe, expect, it } from "vitest";
import { homeFor, routeFor } from "@/lib/access";

describe("page grants", () => {
  it("maps paths to the grant they need", () => {
    expect(routeFor("/clients")).toBe("directory");
    expect(routeFor("/needs-company")).toBe("directory");
    expect(routeFor("/import")).toBe("import");
    expect(routeFor("/accounts")).toBe("accounts");
    expect(routeFor("/importer")).toBe("directory");
    expect(routeFor("/no-access")).toBeNull();
    expect(routeFor("/")).toBeNull();
  });
  it("sends each role to its first granted page", () => {
    expect(homeFor(["directory", "import", "accounts"])).toBe("/clients");
    expect(homeFor(["import", "accounts"])).toBe("/import");
    expect(homeFor(["accounts"])).toBe("/accounts");
    expect(homeFor([])).toBe("/no-access");
  });
});
