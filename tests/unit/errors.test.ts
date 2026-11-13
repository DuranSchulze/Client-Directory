import { expect, it } from "vitest";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { handle } from "@/lib/http/handle";

it("maps known errors and redacts internal errors", async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 429]) {
    const response = await handle(async () => { throw new AppError(status, "Public error", "email"); })();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Public error", field: "email" });
  }
  const response = await handle(async () => { throw new Error("sensitive SQL and account number"); })();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Internal server error" });
});
it("walks nested database causes and handles cycles", async () => {
  const nested = { cause: { cause: { code: "23505", detail: "secret" } } };
  const response = await handle(async () => { throw nested; })();
  expect(response.status).toBe(409);
  expect(await response.text()).not.toContain("secret");
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  expect(isUniqueViolation(cycle)).toBe(false);
});
