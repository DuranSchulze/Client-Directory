import { expect, it } from "vitest";
import { validatePaging, validateSort } from "@/services/validation.service";

it("uses the existing Needs-company paging defaults and trims literal search text", () => {
  expect(validatePaging({ page: null, size: null, q: null })).toEqual({ limit: 25, offset: 0, search: "" });
  expect(validatePaging({ page: "3", size: "50", q: "  %_\\  " })).toEqual({ limit: 50, offset: 100, search: "%_\\" });
});

it.each([
  { field: "page", value: "" }, { field: "page", value: "1.5" }, { field: "page", value: "9007199254740991" },
  { field: "size", value: "24" }, { field: "size", value: "2.5e1" }, { field: "q", value: "a\0b" },
] as const)("rejects invalid $field before a query", ({ field, value }) => {
  expect(() => validatePaging({ page: null, size: null, q: null, [field]: value })).toThrow(expect.objectContaining({ status: 400, field }));
});

it("validates the entire sort value and rejects inherited property names", () => {
  const columns = { name: true };
  expect(validateSort(null, columns, "name")).toEqual({ key: "name", direction: "asc" });
  expect(validateSort("name:desc", columns, "name")).toEqual({ key: "name", direction: "desc" });
  for (const sort of ["", "name", "name:ASC", "name:asc:", "constructor:asc", "unknown:asc"]) {
    expect(() => validateSort(sort, columns, "name")).toThrow(expect.objectContaining({ status: 400, field: "sort" }));
  }
});
