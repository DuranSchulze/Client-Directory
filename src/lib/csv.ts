import type { CompanyListItem } from "./api-types";

// Imported sheet columns, in BUILD.md section 3 order; bank numbers and working columns are excluded.
export const CSV_COLUMNS = [
  ["REGISTERED NAME", "name"], ["ALIAS", "alias"], ["TRADE NAME", "tradeName"],
  ["NON-INDIVIDUAL", "nonIndividual"], ["INDIVIDUAL", "individual"], ["INTERCOMPANY", "entities"],
  ["ENGAGEMENT STATUS", "engagementStatus"], ["ACCTG SERVICE", "acctgService"], ["EFPS/EBIR", "efps"],
  ["ASSIGNED SUPERVISOR", "supervisor"], ["ASSIGNED ASSISTANT", "assistant"],
  ["TIN", "tin"], ["BRANCH CODE", "branchCode"], ["RDO CODE", "rdoCode"], ["ZIP CODE", "zip"],
  ["COMPANY'S REGISTERED ADDRESS", "address"], ["Email (for SI)", "siEmail"], ["Address (for SI)", "siAddress"],
  ["SEC REGISTRATION NO.", "secNo"], ["DATE OF INCORPORATION", "incorporatedOn"], ["COMPANY REGISTRATION DATE", "registeredOn"],
  ["YEAR END", "yearEnd"], ["BOA CLASS", "boaClass"], ["BOOKLET CLASS", "bookletClass"],
  ["PTU LOOSELEAF", "ptuLooseleaf"], ["PTU ISSUED ON", "ptuIssuedOn"], ["ORUS REGISTERED", "orusRegistered"],
  ["CONTACT PERSON/DESIGNATION", "contactPeople"], ["CONTACT NO.", "contactPhones"], ["EMAIL ADDRESS", "contactEmails"], ["BILLING", "contactBilling"],
  ["DATE LAST CHECKED (BILLING)", "lastCheckedBilling"], ["REMARKS (BILLING)", "remarksBilling"],
  ["PAYROLL CLIENT", "payrollClient"], ["BANK", "bank"], ["ACCOUNT NAME", "accountName"], ["ATC", "atc"], ["CLASSIFICATION", "classification"],
  ["DATE LAST CHECKED (AP)", "lastCheckedAp"], ["REMARKS (AP)", "remarksAp"],
  ["DDS GD Link", "gdLink"], ["DATE LAST CHECKED (DOCS)", "lastCheckedDocs"], ["REMARKS (DOCS)", "remarksDocs"],
] as const;
export function csvCell(value: unknown): string {
  let text = value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function companiesCsv(companies: CompanyListItem[]): string {
  const rows = companies.map((company) => {
    const values: Record<string, unknown> = { ...company,
      nonIndividual: company.type === "Non-individual" ? "Yes" : "", individual: company.type === "Individual" ? "Yes" : "",
      engagementStatus: [company.isNew ? "NEW" : "", company.engagement?.toUpperCase()].filter(Boolean).join(", "),
      contactPeople: company.contacts.map((contact) => [contact.name, contact.designation].filter(Boolean).join(" - ")).join(" / "),
      contactPhones: company.contacts.map((contact) => contact.phones.join(", ")).join(" / "),
      contactEmails: company.contacts.map((contact) => contact.emails.join(", ")).join(" / "),
      contactBilling: company.contacts.map((contact) => contact.billingRole).join(" / "),
    };
    return CSV_COLUMNS.map(([, key]) => csvCell(values[key])).join(",");
  });
  return "\uFEFF" + [CSV_COLUMNS.map(([header]) => csvCell(header)).join(","), ...rows].join("\r\n") + "\r\n";
}
