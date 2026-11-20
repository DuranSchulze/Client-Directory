import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/services/distribute.service", () => ({ distributeMatches: m.run }));
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); vi.stubEnv("NEXT_RUNTIME", "nodejs"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VITEST", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("NEXT_PHASE", ""); vi.stubEnv("AUTO_DISTRIBUTE", "1"); m.run.mockResolvedValue({}); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
it.each([[undefined, 15], ["2", 5], ["20", 20], ["bad", 15], ["40000", 15]])("schedules %s at %s minutes", async (value, minutes) => {
  vi.stubEnv("DISTRIBUTE_EVERY_MINUTES", value);
  const { register } = await import("@/instrumentation"); await register();
  await vi.advanceTimersByTimeAsync(minutes * 60_000 - 1); expect(m.run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(m.run).toHaveBeenCalledTimes(1);
});
it.each([["NEXT_RUNTIME", "edge"], ["NEXT_PHASE", "phase-production-build"], ["NODE_ENV", "test"], ["VITEST", "true"], ["VERCEL", "1"], ["AUTO_DISTRIBUTE", ""]])("does not schedule under %s=%s", async (key, value) => {
  vi.stubEnv(key, value);
  const { register } = await import("@/instrumentation"); await register();
  expect(vi.getTimerCount()).toBe(0);
});
it("logs a failed timer run and permits the next tick", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    m.run.mockRejectedValueOnce(new Error("Failed"));
    const { register } = await import("@/instrumentation"); await register();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(log).toHaveBeenCalledWith("Automatic contact distribution failed"); expect(m.run).toHaveBeenCalledTimes(2);
  } finally { log.mockRestore(); }
});
