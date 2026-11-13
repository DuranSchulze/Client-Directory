import { expect, it } from "vitest";
import { companyDto } from "@/lib/dto";
import { CSV_COLUMNS, companiesCsv, csvCell } from "@/lib/csv";
import { COMPANY_DATE_FIELDS, COMPANY_TEXT_FIELDS } from "@/lib/api-types";
import type { CompanyRow } from "@/db/schema/companies";

function company(): CompanyRow {
  const fields = Object.fromEntries([...COMPANY_TEXT_FIELDS, ...COMPANY_DATE_FIELDS].map((key) => [key, null])) as Pick<CompanyRow, (typeof COMPANY_TEXT_FIELDS)[number] | (typeof COMPANY_DATE_FIELDS)[number]>;
  const row: CompanyRow = { ...fields,
    id: 1, name: "Acme", nameKey: "acme", type: "Non-individual", entities: [], engagement: null, isNew: false,
    efps: null, accountNo: "secret-ciphertext", accountNoLast4: "1234", createdBy: "admin@example.test", createdAt: new Date("2026-01-01Z"), updatedAt: new Date("2026-01-02Z") };
  return Object.assign(row, { passwordHash: "injected-secret", account_no: "injected-snake-secret" });
}
it("whitelists company fields and serializes timestamps without exposing secrets", () => {
  const dto = companyDto(company());
  const json = JSON.stringify(dto);
  expect(json).not.toMatch(/secret|passwordHash|account_no|accountNo"/);
  expect(dto.accountNoLast4).toBe("1234");
  expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(dto.incorporatedOn).toBeNull();
});
it("exports a BOM and the sheet columns, guards formulas and excludes account numbers", () => {
  const dto = companyDto(company());
  const csv = companiesCsv([{ ...dto, name: ' =HYPERLINK("bad")', contacts: [], gmail: { stage: null, lastContact: null, needsCheck: [], candidateIds: [] }, probity: false }]);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"\' =HYPERLINK(""bad"")"');
  expect(csv).not.toMatch(/secret|account_no|accountNo|1234/);
  expect(csv.split("\r\n")[0]).toBe("\uFEFF" + CSV_COLUMNS.map(([header]) => csvCell(header)).join(","));
  expect(CSV_COLUMNS[0][0]).toBe("REGISTERED NAME");
  expect(csvCell('line1\nline2,"quoted"')).toBe('"line1\nline2,""quoted"""');
  for (const value of ["=cmd", "+cmd", "-cmd", "@cmd", "\tcmd", " \t=cmd", "\r\ncmd"]) expect(csvCell(value)).toMatch(/^"'/);
});
