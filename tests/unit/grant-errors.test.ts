import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/http";
import { handleGrantError } from "@/lib/api/grant-errors";
import { keys } from "@/lib/api/queries";

const setup = () => {
  const qc = new QueryClient();
  qc.setQueryData(keys.me, { routes: ["directory"] });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  return { qc, invalidate, end: vi.fn() };
};

describe("grant errors", () => {
  it("re-reads grants when another endpoint answers 403", () => {
    const { qc, invalidate, end } = setup();
    handleGrantError(new ApiError("You don't have access to this page", 403), qc, keys.companies, end);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.me });
    expect(end).not.toHaveBeenCalled();
  });
  it("ends the session without re-reading when the grants query itself answers 403", () => {
    const { qc, invalidate, end } = setup();
    handleGrantError(new ApiError("Access denied", 403), qc, keys.me, end);
    expect(invalidate).not.toHaveBeenCalled();
    expect(qc.getQueryData(keys.me)).toBeUndefined();
    expect(end).toHaveBeenCalledOnce();
  });
  it("ignores other errors", () => {
    const { qc, invalidate, end } = setup();
    handleGrantError(new ApiError("Bad", 400), qc, keys.companies, end);
    handleGrantError(new Error("network"), qc, keys.me, end);
    expect(invalidate).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
