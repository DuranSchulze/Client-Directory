import { describe, expect, it } from "vitest";
import { split } from "@/components/shared/conversations";

describe("conversation snippet split", () => {
  it("splits subject and body", () => {
    expect(split({ snippet: "Invoice — Please pay — thanks" })).toEqual({ subject: "Invoice", body: "Please pay — thanks" });
  });
  it("keeps a subject-only snippet as the subject", () => {
    expect(split({ snippet: "Invoice —" })).toEqual({ subject: "Invoice", body: "" });
  });
  it("keeps a subjectless snippet whole as the body", () => {
    expect(split({ snippet: "— Revisit the original — then send it" })).toEqual({ subject: "", body: "Revisit the original — then send it" });
  });
  it("keeps a body that ends in a dash as body", () => {
    expect(split({ snippet: "Invoice — Please pay —" })).toEqual({ subject: "Invoice", body: "Please pay —" });
  });
  it("keeps body indentation and leading blank lines", () => {
    expect(split({ snippet: "Quote — \n  Item    Amount" }).body).toBe("\n  Item    Amount");
    expect(split({ snippet: "—   Item    Amount" }).body).toBe("  Item    Amount");
  });
  it("treats a snippet without a separator as body", () => {
    expect(split({ snippet: "Hello there" })).toEqual({ subject: "", body: "Hello there" });
  });
});
