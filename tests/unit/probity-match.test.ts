import { expect, it } from "vitest";
import { matchProbity } from "@/services/probity-match";

const companies = [{ id: 1, name: "First Company Inc", alias: "First Alias", tradeName: "First Trade" }, { id: 2, name: "Second Corporation", alias: null, tradeName: null }];
const contacts = [{ companyId: 2, emails: ["owner@example.com"] }];
const row = { companyListed: "First", emails: ["OWNER@EXAMPLE.COM"], companyId: null, matchedBy: null };
it("matches email before name and preserves manual matches", () => {
  expect(matchProbity(row, companies, contacts)).toEqual({ companyId: 2, matchedBy: "email" });
  expect(matchProbity({ ...row, companyId: 1, matchedBy: "manual" }, companies, contacts)).toEqual({ companyId: 1, matchedBy: "manual" });
});
it("matches registered, alias and trade names, then clears stale automatic matches", () => {
  for (const companyListed of ["THE FIRST LTD", "First Alias (PH)", "First Trade Inc"]) {
    expect(matchProbity({ ...row, companyListed, emails: [] }, companies, contacts)).toEqual({ companyId: 1, matchedBy: "name" });
  }
  expect(matchProbity({ ...row, companyListed: "Unknown", emails: [], companyId: 1, matchedBy: "email" }, companies, [])).toEqual({ companyId: null, matchedBy: null });
  expect(matchProbity({ ...row, companyListed: "Inc", emails: [] }, companies, [])).toEqual({ companyId: null, matchedBy: null });
});
