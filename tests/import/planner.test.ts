import { afterEach, expect, it, vi } from "vitest";
import * as matcher from "@/services/probity-match";
import * as XLSX from "xlsx";
import { COMPANY_DATE_FIELDS, COMPANY_TEXT_FIELDS } from "@/lib/api-types";
import type { CompanyRow } from "@/db/schema/companies";
import { parseWorkbook } from "@/lib/import/parse";
import { fillEmpty, planImport, type ImportSnapshot } from "@/lib/import/plan";
afterEach(() => vi.restoreAllMocks());

function parse(tabs: Record<string, unknown[][]>) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tabs)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return parseWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}
function snapshot(): ImportSnapshot { return { companies: [], contacts: [], deptEmails: [], suppliers: [], probity: [] }; }
function company(): CompanyRow {
  const fields = Object.fromEntries([...COMPANY_TEXT_FIELDS, ...COMPANY_DATE_FIELDS].map((key) => [key, null])) as Pick<CompanyRow, (typeof COMPANY_TEXT_FIELDS)[number] | (typeof COMPANY_DATE_FIELDS)[number]>;
  return { ...fields, id: 1, name: "Acme Inc.", nameKey: "acme", type: "Non-individual", entities: ["DDS"], isNew: false, engagement: "inactive", efps: null, accountNo: "existing-cipher", accountNoLast4: "6789", createdBy: "admin", createdAt: new Date(), updatedAt: new Date(), address: "Admin edited address" };
}
it("merges spellings, keeps the first email owner and excludes the parsed department tab", () => {
  const input = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "ALIAS"], ["The Acme Inc.", "shared@example.test", null], ["ACME LTD", "second@example.test", "Alias"], ["Other", "shared@example.test"], ["Internal", "staff@example.test"]],
    "All Dept. Emails": [["Name", "Email Address"], ["Staff", "staff@example.test"]] });
  const plan = planImport(input, snapshot());
  expect(plan.companies).toHaveLength(3);
  expect(plan.companies[0].values.alias).toBe("Alias");
  expect(plan.contacts.flatMap((row) => row.emails)).toEqual(["shared@example.test", "second@example.test"]);
  expect(plan.contacts.filter((row) => row.billingRole === "main")).toHaveLength(1);
  expect(plan.preview.buckets.mergedSpellings).toHaveLength(1);
  expect(plan.preview.buckets.sharedEmails).toHaveLength(1);
  expect(plan.preview.buckets.internalEmails).toHaveLength(1);
  expect(plan.preview.buckets.rowsWithoutEmail).toHaveLength(2);
});
it("fills empty fields only, merges entities, preserves admin edits, and never overwrites a manual match", () => {
  const old = snapshot();
  old.companies = [company()];
  old.contacts = [{ id: 1, companyId: 1, name: "Admin contact", designation: null, emails: ["main@example.test"], phones: [], billingRole: "main", updatedAt: new Date() }];
  old.probity = [{ id: 1, companyListed: "Acme", companyId: 1, matchedBy: "manual", contactPerson: null, emails: [], service: "Admin service", agreementUrl: null, draftedOn: "2026-01-01", referenceNo: "R1", remarks: "Admin remarks", updatedAt: new Date() }];
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "INTERCOMPANY", "ENGAGEMENT STATUS", "INDIVIDUAL", "COMPANY'S REGISTERED ADDRESS", "BANK", "ACCOUNT NO"], ["Acme Ltd", "main@example.test", "DDS, FILEPINO", "NEW, ACTIVE", "X", "Sheet address", "New bank", "000111222"]],
    "Probity Clients": [["COMPANY", "Reference Number", "Date Drafted", "Service", "Remarks/Status"], ["Acme", "R1", "2026-01-01", "Sheet service", "Sheet remarks"]] });
  const plan = planImport(parsed, old);
  expect(plan.contacts).toHaveLength(0);
  expect(plan.companies[0].values).toMatchObject({ entities: ["DDS", "FILEPINO"], isNew: true, type: "Individual", bank: "New bank" });
  expect(plan.companies[0].values).not.toHaveProperty("address");
  expect(plan.companies[0].values).not.toHaveProperty("engagement");
  expect(plan.companies[0].values).not.toHaveProperty("accountNo");
  expect(plan.probity).toHaveLength(0);
  expect(plan.preview.probity).toEqual({ matched: 1, notFound: 0 });
  expect(fillEmpty({ text: "", bool: false, collection: {}, list: [] }, { text: "new", bool: true, collection: { x: 1 }, list: [1] })).toEqual({ text: "new", collection: { x: 1 }, list: [1] });
});
it("dedupes auxiliary tables by their specified keys and keeps separate probity engagements", () => {
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "main@example.test"]],
    "OPS Supplier": [["Supplier /Contractor", "Particulars", "Contact Details"], ["Vendor", "Print", null], ["VENDOR", "PRINT", "Jane"]],
    "All Dept. Emails": [["Name", "Email Address"], ["Staff", "staff@example.test"], ["Other", "staff@example.test"]],
    "Probity Clients": [["COMPANY", "Reference Number", "Date Drafted", "Email Address"], ["Acme", "R1", "2026-01-01", "main@example.test"], ["ACME INC", "R1", "2026-01-01", "main@example.test"], ["Acme", "R2", "2026-01-02", "main@example.test"], ["Unknown", "R3", null, "unknown@example.test"]] });
  const plan = planImport(parsed, snapshot());
  expect(plan.suppliers).toHaveLength(1);
  expect(plan.suppliers[0].values.contactName).toBe("Jane");
  expect(plan.deptEmails).toHaveLength(1);
  expect(plan.probity).toHaveLength(3);
  expect(plan.preview.probity).toEqual({ matched: 2, notFound: 1 });
});
it("flags and drops a duplicate TIN/branch while still planning both clients", () => {
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "TIN", "BRANCH CODE"], ["Acme", "a@example.test", "123-456-789-000", "00000"], ["Other", "b@example.test", "123-456-789-000", "00000"]] });
  const plan = planImport(parsed, snapshot());
  expect(plan.companies).toHaveLength(2);
  expect(plan.companies[1].values.tin).toBeNull();
  expect(plan.preview.buckets.invalidValues).toHaveLength(1);
});
it("keeps distinct unnamed department mailboxes and dedupes them by email on re-import", () => {
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "client@example.test / one@example.test / two@example.test"]],
    "All Dept. Emails": [["Name", "Email Address"], [null, "ACCOUNTING DEPARTMENT"], [null, "one@example.test"], [null, "two@example.test"]] });
  const plan = planImport(parsed, snapshot());
  expect(plan.deptEmails.flatMap((row) => row.values.emails ?? [])).toEqual(["one@example.test", "two@example.test"]);
  expect(plan.contacts.flatMap((row) => row.emails)).toEqual(["client@example.test"]);
  const old = snapshot();
  old.deptEmails = plan.deptEmails.map(({ values }, index) => ({ id: index + 1, department: values.department, name: values.name ?? null, title: values.title ?? null, emails: values.emails ?? [], sortOrder: values.sortOrder ?? 0 }));
  expect(planImport(parsed, old).deptEmails).toHaveLength(0);
});
it("checks email before name, then name before not-found in the actual import planner", () => {
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"]],
    "Probity Clients": [["COMPANY", "Reference Number", "Email Address"], ["First", "R1", "OWNER@EXAMPLE.TEST"], ["First", "R2"], ["Unknown", "R3"]] });
  const old = snapshot();
  old.companies = [{ ...company(), id: 1, name: "First", nameKey: "first" }, { ...company(), id: 2, name: "Second", nameKey: "second" }];
  old.contacts = [{ id: 1, companyId: 2, name: null, designation: null, emails: ["owner@example.test"], phones: [], billingRole: "main", updatedAt: new Date() }];
  const spy = vi.spyOn(matcher, "matchProbity");
  const plan = planImport(parsed, old);
  expect(spy.mock.results.map((result) => result.value)).toEqual([{ companyId: 2, matchedBy: "email" }, { companyId: 1, matchedBy: "name" }, { companyId: null, matchedBy: null }]);
  expect(plan.preview.probity).toEqual({ matched: 2, notFound: 1 });
});
it("does not repeatedly update an empty TIN when a conflicting TIN is skipped", () => {
  const parsed = parse({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "TIN"], ["Acme", null, "123-456-789-000"]] });
  const old = snapshot();
  old.companies = [company(), { ...company(), id: 2, name: "Other", nameKey: "other", tin: "123-456-789-000" }];
  expect(planImport(parsed, old).companies).toHaveLength(0);
});
