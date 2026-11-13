import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, parseDate } from "@/lib/import/parse";
import { packArchive, readArchive } from "@/lib/import/archive";
import { IMPORT_LIMITS } from "@/lib/import/contract";

function workbook(tabs: Record<string, unknown[][]>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, cells] of Object.entries(tabs)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(cells), name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true });
}
it("normalizes tabs and headers, zips contacts, keeps SI emails and parses sheet values", () => {
  const data = workbook({ "ALL CLIENTS  Database": [
    ["REGISTERED NAME", "EMAIL ADDRESS", "CONTACT PERSON/DESIGNATION", "CONTACT NO.", "BILLING", "INTERCOMPANY", "ENGAGEMENT STATUS", "INDIVIDUAL", "DATE OF INCORPORATION", "RDO CODE", "BRANCH CODE", "ZIP CODE", "Email (for SI)", "DATE LAST CHECKED\n(BILLING)", "Unknown column"],
    ["The Acme Inc.", "main@example.test / cc@example.test", "Main Person / Copy Person", "09171234567 / 09181234567", "Main / cc", "dds, FILEPINO", "NEW, ACTIVE", "X", 45994.46, "050", "00000", "0010", "si@example.test", "08/14/2020", "ignored"],
  ] });
  const parsed = parseWorkbook(data);
  const row = parsed.companies[0];
  expect(row.company).toMatchObject({ name: "The Acme Inc.", type: "Individual", isNew: true, engagement: "active", entities: ["DDS", "FILEPINO"], incorporatedOn: "2025-12-03", rdoCode: "050", branchCode: "00000", zip: "0010", lastCheckedBilling: "2020-08-14", siEmail: "si@example.test" });
  expect(row.contacts.map((contact) => [contact.name, contact.emails, contact.billingRole])).toEqual([
    ["Main Person", ["main@example.test"], "main"], ["Copy Person", ["cc@example.test"], "cc"], [undefined, ["si@example.test"], "none"],
  ]);
  expect(row.contacts[0].phones).toEqual(["+639171234567"]);
  expect(parsed.buckets.checkContacts).toHaveLength(0);
  expect(parsed.buckets.unmatchedHeaders).toHaveLength(1);
});
it("flags mismatched packed contacts, drops invalid emails and imports rows without email", () => {
  const parsed = parseWorkbook(workbook({ "All Clients Database": [
    ["REGISTERED NAME", "EMAIL ADDRESS", "CONTACT PERSON", "BILLING", "ALIAS"],
    ["Acme", "one@example.test / two@example.test / invalid @mail.test", "Person", "main", "N/A"],
    ["No Address", "N/A"],
  ] }));
  expect(parsed.companies[0].contacts.map((contact) => contact.emails[0])).toEqual(["one@example.test", "two@example.test"]);
  expect(parsed.companies[0].company.alias).toBeNull();
  expect(parsed.buckets.checkContacts).toHaveLength(1);
  expect(parsed.buckets.invalidEmails.length).toBeGreaterThan(0);
  expect(parsed.buckets.rowsWithoutEmail).toHaveLength(1);
  expect(parsed.companies[1].contacts).toHaveLength(0);
});
it("parses probity, supplier contact details, department sections and shared mailboxes", () => {
  const parsed = parseWorkbook(workbook({
    "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "client@example.test"]],
    "Probity Clients": [["COMPANY", "Email Address", "Reference Number", "Date Drafted", "Service"], ["Acme"], ["Acme", "client@example.test\nbad @example.test", "F-001", 45994, "Probity"]],
    "OPS Supplier": [["Supplier /Contractor", "Particulars", "Contact Details"], ["Vendor", "Printing", "Jane Doe\nEmail Add: vendor@example.test"]],
    "All Dept. Emails": [["No.", "Name", "Title", "Email Address", "Other email address"], [null, "ACCOUNTING DEPARTMENT"], [1, "Staff", "Lead", "staff@example.test"], [null, null, null, null, "shared@example.test"], [null, null, "LEGAL DEPARTMENT"], [2, "Lawyer", null, "legal@example.test"]],
  }));
  expect(parsed.probity).toHaveLength(1);
  expect(parsed.probity[0].value).toMatchObject({ emails: ["client@example.test"], draftedOn: "2025-12-03", referenceNo: "F-001" });
  expect(parsed.buckets.invalidEmails).toHaveLength(1);
  expect(parsed.suppliers[0].value).toMatchObject({ name: "Vendor", contactName: "Jane Doe", emails: ["vendor@example.test"] });
  expect(parsed.deptEmails.map(({ value }) => [value.department, value.name, value.emails])).toEqual([
    ["ACCOUNTING DEPARTMENT", "Staff", ["staff@example.test"]], ["ACCOUNTING DEPARTMENT", null, ["shared@example.test"]], ["LEGAL DEPARTMENT", "Lawyer", ["legal@example.test"]],
  ]);
});
it("reads formatted leading-zero codes from numeric cells and handles date systems", () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS", "BRANCH CODE"], ["Acme", "x@example.test", 12]]);
  sheet.C2.z = "00000";
  XLSX.utils.book_append_sheet(book, sheet, "All Clients Database");
  const parsed = parseWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  expect(parsed.companies[0].company.branchCode).toBe("00012");
  expect(parseDate({ t: "n", v: 0 }, true)).toBe("1904-01-01");
  expect(parseDate({ t: "s", v: "02/29/2025" })).toBeNull();
});
it("ignores forged large and small worksheet dimensions", () => {
  const data = workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "x@example.test"]] });
  for (const ref of ["A1:XFD1048576", "A1:A1"]) {
    const files = readArchive(data);
    const path = "xl/worksheets/sheet1.xml";
    files.set(path, Buffer.from(files.get(path)!.toString().replace(/<dimension\b[^>]*>/, `<dimension ref="${ref}"/>`)));
    expect(parseWorkbook(packArchive(files)).companies[0].company.name).toBe("Acme");
  }
});
it("rejects oversized, expanded, entry-heavy, malformed and over-wide workbooks", () => {
  expect(() => parseWorkbook(Buffer.alloc(IMPORT_LIMITS.bytes + 1))).toThrow("10 MB");
  expect(() => parseWorkbook(Buffer.from("not a zip"))).toThrow("valid .xlsx");
  const data = workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "x@example.test"]] });
  const expanded = Buffer.from(data);
  const central = expanded.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expanded.writeUInt32LE(IMPORT_LIMITS.expandedBytes + 1, central + 24);
  expect(() => parseWorkbook(expanded)).toThrow("100 MB");
  const understated = Buffer.from(data);
  understated.writeUInt32LE(1, central + 24);
  expect(() => parseWorkbook(understated)).toThrow("valid .xlsx");
  const many = Buffer.from(data);
  many.writeUInt16LE(2001, many.length - 22 + 8);
  many.writeUInt16LE(2001, many.length - 22 + 10);
  expect(() => parseWorkbook(many)).toThrow("2,000");
  const wide = readArchive(data);
  wide.set("xl/worksheets/sheet1.xml", Buffer.from(wide.get("xl/worksheets/sheet1.xml")!.toString().replace('r="B2"', 'r="GS2"')));
  expect(() => parseWorkbook(packArchive(wide))).toThrow("200 columns");
});
it("rejects more than 20,000 real data rows and allows titles above a full-sized sheet", () => {
  const rows = Array.from({ length: 20000 }, (_, i) => [`Client ${i}`, `${i}@example.test`]);
  const valid = workbook({ "All Clients Database": [["Title"], [], [], [], [], [], [], [], [], ["REGISTERED NAME", "EMAIL ADDRESS"], ...rows] });
  expect(parseWorkbook(valid).companies).toHaveLength(20000);
  const oversized = workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ...rows, ["Extra", "extra@example.test"]] });
  expect(() => parseWorkbook(oversized)).toThrow("20,000");
}, 30000);
it("blocks only unreadable files and missing required main tab/headers", () => {
  expect(() => parseWorkbook(workbook({ Other: [["A"]] }))).toThrow("All Clients");
  expect(() => parseWorkbook(workbook({ "All Clients Database": [["REGISTERED NAME"]] }))).toThrow("headers");
  expect(parseWorkbook(workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"]], "OPS Supplier": [["Unknown"]] })).buckets.unmatchedHeaders).toHaveLength(1);
});
it.each([false, true])("preserves data around self-closing empty rows (titles=%s)", (titles) => {
  const rows = titles ? [["Title"], [], ["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "x@example.test"]] : [["REGISTERED NAME", "EMAIL ADDRESS"], [], ["Acme", "x@example.test"]];
  const files = readArchive(workbook({ "All Clients Database": rows }));
  const path = "xl/worksheets/sheet1.xml";
  files.set(path, Buffer.from(files.get(path)!.toString().replace('<row r="3"', '<row r="2" ht="24" customHeight="1"/><row r="3"')));
  expect(parseWorkbook(packArchive(files)).companies.map((row) => row.company.name)).toEqual(["Acme"]);
});
it("still enforces the column limit after a self-closing empty cell", () => {
  const files = readArchive(workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS"], ["Acme", "x@example.test"]] }));
  const path = "xl/worksheets/sheet1.xml";
  files.set(path, Buffer.from(files.get(path)!.toString().replace(/(<row r="2"[^>]*>[\s\S]*?)(<\/row>)/, '$1<c r="C2"/><c r="GS2"><v>1</v></c>$2')));
  expect(() => parseWorkbook(packArchive(files))).toThrow("200 columns");
});
it("uses numeric values when General formatting rounds long account numbers to scientific notation", () => {
  const parsed = parseWorkbook(workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "ACCOUNT NO"], ["Acme", "x@example.test", 123456789012]] }));
  expect(parsed.companies[0].company.accountNo).toBe("123456789012");
  expect(parseDate({ t: "s", v: "0000-01-01" })).toBeNull();
});
it("zips populated optional columns without letting blank phone/name columns override billing roles", () => {
  for (const person of ["A / B", null]) {
    const parsed = parseWorkbook(workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "CONTACT PERSON", "CONTACT NO.", "BILLING"], ["Acme", "a@t.test / b@t.test", person, null, "cc / main"]] }));
    expect(parsed.companies[0].contacts.map((row) => row.billingRole)).toEqual(["cc", "main"]);
    expect(parsed.buckets.checkContacts).toHaveLength(0);
  }
});
it("preserves aligned billing roles during a genuine packed-contact fallback", () => {
  const parsed = parseWorkbook(workbook({ "All Clients Database": [["REGISTERED NAME", "EMAIL ADDRESS", "CONTACT PERSON", "BILLING"], ["Acme", "a@t.test / b@t.test", "Only one name", "cc / main"]] }));
  expect(parsed.companies[0].contacts.map((row) => row.billingRole)).toEqual(["cc", "main"]);
  expect(parsed.buckets.checkContacts).toHaveLength(1);
});
