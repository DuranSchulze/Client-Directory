import { describe, expect, it } from "vitest";
import { validateCompany, validateContact, validateDeptEmail, validateProbity, validateSupplier, id } from "@/services/validation.service";

describe("domain validation", () => {
  it("normalizes company inputs and preserves text codes", () => {
    expect(validateCompany({ name: "  Acme   Ltd. ", branchCode: "00000", tin: "123-456-789-000", siEmail: " SI@EXAMPLE.COM ", gdLink: "https://example.com/docs", entities: ["DDS", "DDS"], incorporatedOn: "2024-02-29", isNew: false }))
      .toEqual({ name: "Acme Ltd.", branchCode: "00000", tin: "123-456-789-000", siEmail: "si@example.com", gdLink: "https://example.com/docs", entities: ["DDS"], incorporatedOn: "2024-02-29", isNew: false });
    expect(validateCompany({ address: null, tin: "N/A" }, true)).toEqual({ address: null, tin: null });
  });
  it.each([
    [{ name: " " }, "name"], [{ name: "The Inc" }, "name"], [{ name: "Acme", tin: "123" }, "tin"],
    [{ name: "Acme", entities: ["BAD"] }, "entities"], [{ name: "Acme", engagement: "NEW" }, "engagement"],
    [{ name: "Acme", efps: "bad" }, "efps"], [{ name: "Acme", isNew: "true" }, "isNew"],
    [{ name: "Acme", type: "unknown" }, "type"], [{ name: "Acme", gdLink: "javascript:alert(1)" }, "gdLink"],
    [{ name: "Acme", siEmail: "bad" }, "siEmail"], [{ name: "Acme", yearEnd: "2025-02-29" }, "yearEnd"],
    [{ name: "Acme", createdBy: "attacker" }, "createdBy"], [{ name: "Acme", accountNoLast4: "leak" }, "accountNoLast4"],
  ])("rejects invalid or read-only company values", (body, field) => {
    try { validateCompany(body); throw new Error("Expected validation to fail"); }
    catch (error) { expect(error).toMatchObject({ status: 400, field }); }
  });
  it("normalizes email and phone lists and checks billing roles", () => {
    expect(validateContact({ emails: [" X@EXAMPLE.COM ", "x@example.com"], phones: ["0917 123 4567"], billingRole: "cc" }))
      .toEqual({ emails: ["x@example.com"], phones: ["+639171234567"], billingRole: "cc" });
    expect(validateContact({ name: null }, true)).toEqual({ name: null });
    expect(() => validateContact({ emails: ["bad"] })).toThrow();
    expect(() => validateContact({ emails: [], phones: ["123"] })).toThrow();
    expect(() => validateContact({ emails: [], billingRole: "admin" })).toThrow();
    expect(() => validateContact({ emails: [], companyId: 999 })).toThrow();
  });
  it("validates auxiliary lists and positive safe identifiers", () => {
    expect(validateDeptEmail({ department: "Accounting", emails: ["HQ@EXAMPLE.COM"], sortOrder: 0 })).toEqual({ department: "Accounting", emails: ["hq@example.com"], sortOrder: 0 });
    expect(() => validateDeptEmail({ department: " " })).toThrow();
    expect(() => validateDeptEmail({ department: "A", sortOrder: -1 })).toThrow();
    expect(validateProbity({ companyListed: "Acme", companyId: null, draftedOn: "2026-01-02" })).toEqual({ companyListed: "Acme", companyId: null, draftedOn: "2026-01-02" });
    expect(() => validateProbity({ companyListed: "Acme", agreementUrl: "http://example.com" })).toThrow();
    expect(validateSupplier({ name: null, emails: [] })).toEqual({ name: null, emails: [] });
    for (const value of [0, -1, 1.5, "1junk", "0", Number.MAX_SAFE_INTEGER + 1]) expect(() => id(value)).toThrow();
    expect(id("123")).toBe(123);
  });
});
