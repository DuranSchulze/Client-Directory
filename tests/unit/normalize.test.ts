import { describe, expect, it } from "vitest";
import { EMAIL_RE, TIN_RE, isFreeMail, nameKey, normEmail, nullText, toE164 } from "@/lib/normalize";

describe("normalization", () => {
  it("normalizes names without losing letters or meaningful words", () => {
    expect(nameKey(" The Acme (Philippines), Pte. Ltd. ")).toBe("acme");
    expect(nameKey("Theatre Corporation")).toBe("theatre");
    expect(nameKey("Peña & Sons OPC")).toBe("peña sons");
    expect(nameKey("Acme-Co Inc.")).toBe(nameKey("ACME CO"));
  });
  it("normalizes emails and checks their whole shape", () => {
    expect(normEmail(" A+Billing@EXAMPLE.COM ")).toBe("a+billing@example.com");
    expect(EMAIL_RE.test("a+billing@example.com")).toBe(true);
    for (const value of ["a@", "a @example.com", "a@example.com trailing", "a@-example.com"]) expect(EMAIL_RE.test(value)).toBe(false);
  });
  it("validates TIN and PH phone numbers", () => {
    expect(TIN_RE.test("123-456-789-00000")).toBe(true);
    expect(TIN_RE.test("123456789")).toBe(false);
    expect(toE164("0917 123 4567")).toBe("+639171234567");
    expect(toE164("invalid")).toBeNull();
  });
  it("handles null tokens without losing zeroes", () => {
    for (const value of [null, undefined, "", "  ", "n/a", "NA", "-", "tbd", "#REF!"]) expect(nullText(value)).toBeNull();
    expect(nullText("00000")).toBe("00000");
  });
  it("excludes regional free-mail domains and preserves corporate domains", () => {
    for (const domain of ["gmail.com", "Yahoo.com.ph", "hotmail.co.uk", "proton.me", "gmx.de", "mail.ru"]) expect(isFreeMail(domain)).toBe(true);
    expect(isFreeMail("gmail-tools.example")).toBe(false);
    expect(isFreeMail("example.com")).toBe(false);
  });
});
