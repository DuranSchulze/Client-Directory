import { describe, expect, it } from "vitest";
import { day, manilaDayEnd, manilaDayStart, validDay } from "@/lib/format";

describe("clients date filter helpers", () => {
  it("rejects values that are not a real calendar day", () => {
    for (const bad of ["", "invalid", "2026-13-01", "2026-02-30", "2026-1-1", "20261113"]) expect(validDay(bad)).toBe("");
    expect(validDay("2026-11-13")).toBe("2026-11-13");
  });
  it("bounds a day on the Manila calendar, not the browser's", () => {
    expect(manilaDayStart("2026-11-14")).toBe("2026-11-13T16:00:00.000Z");
    expect(manilaDayEnd("2026-11-14")).toBe("2026-11-14T15:59:59.999Z");
  });
  it("a timestamp near Manila midnight falls on the day the Date added column shows", () => {
    const createdAt = "2026-11-13T17:00:00.000Z"; // 01:00 on Nov 14 in Manila
    expect(day(createdAt)).toBe("Nov 14, 2026");
    expect(createdAt >= manilaDayStart("2026-11-14") && createdAt <= manilaDayEnd("2026-11-14")).toBe(true);
    expect(createdAt <= manilaDayEnd("2026-11-13")).toBe(false);
  });
});
