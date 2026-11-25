import { expect, it } from "vitest";
import { contactInstant } from "@/components/lists/inquiries-view";

it("reads offset-free dates as UTC, like the server sort", () => {
  expect(contactInstant("2026-11-10")).toBe("2026-11-10T00:00:00.000Z");
  expect(contactInstant("2026-11-10 23:30")).toBe("2026-11-10T23:30:00.000Z");
  expect(contactInstant("2026-11-10T08:34:20Z")).toBe("2026-11-10T08:34:20.000Z");
  expect(contactInstant("2026-11-10T08:00:00+08:00")).toBe("2026-11-10T00:00:00.000Z");
  // A valid offset date that crosses UTC midnight keeps its instant.
  expect(contactInstant("2026-11-11T05:00:00+08:00")).toBe("2026-11-10T21:00:00.000Z");
});
it("treats impossible or missing dates as missing", () => {
  expect(contactInstant("2026-02-30")).toBeNull();
  expect(contactInstant("2026-02-30T10:00:00+08:00")).toBeNull();
  expect(contactInstant("yesterday")).toBeNull();
  expect(contactInstant(null)).toBeNull();
});
