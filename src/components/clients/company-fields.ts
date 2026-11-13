import type { CompanyItem, CompanyValues } from "@/lib/api-types";

// One field config drives the read view and the edit form, so the two never drift apart.
export type FieldKind = "text" | "date" | "textarea" | "url" | "email" | "select" | "entities" | "bool";
export type FieldDef = {
  key: keyof CompanyValues; label: string; kind?: FieldKind; full?: boolean;
  options?: readonly { value: string; label: string }[]; placeholder?: string; hint?: string;
};
export type FieldGroup = { title: string; fields: FieldDef[]; showWhen?: (c: CompanyItem) => boolean };

export const TYPE_OPTIONS = [{ value: "Non-individual", label: "Non-individual" }, { value: "Individual", label: "Individual" }] as const;
export const ENGAGEMENT_OPTIONS = [{ value: "", label: "Not set" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] as const;
export const EFPS_OPTIONS = [{ value: "", label: "Not set" }, { value: "eBIR", label: "eBIR" }, { value: "eFPS", label: "eFPS" }, { value: "VDS", label: "VDS" }] as const;

export const GROUPS: FieldGroup[] = [
  { title: "Identity", fields: [
    { key: "alias", label: "Alias" },
    { key: "tradeName", label: "Trade name" },
    { key: "type", label: "Type", kind: "select", options: TYPE_OPTIONS },
    { key: "entities", label: "Intercompany", kind: "entities", full: true },
  ] },
  { title: "Engagement", fields: [
    { key: "engagement", label: "Engagement status", kind: "select", options: ENGAGEMENT_OPTIONS },
    { key: "isNew", label: "New client", kind: "bool" },
    { key: "acctgService", label: "Acctg service" },
    { key: "efps", label: "EFPS / eBIR", kind: "select", options: EFPS_OPTIONS },
    { key: "supervisor", label: "Assigned supervisor" },
    { key: "assistant", label: "Assigned assistant" },
  ] },
  { title: "BIR & SEC", fields: [
    { key: "tin", label: "TIN", placeholder: "000-000-000-00000", hint: "Format 000-000-000-000 (3 to 5 digits at the end)" },
    { key: "branchCode", label: "Branch code" },
    { key: "rdoCode", label: "RDO code" },
    { key: "zip", label: "Zip code" },
    { key: "address", label: "Registered address", kind: "textarea", full: true },
    { key: "secNo", label: "SEC registration no." },
    { key: "incorporatedOn", label: "Date of incorporation", kind: "date" },
    { key: "registeredOn", label: "Company registration date", kind: "date" },
    { key: "yearEnd", label: "Year end", kind: "date" },
    { key: "boaClass", label: "BOA class" },
    { key: "bookletClass", label: "Booklet class" },
    { key: "ptuLooseleaf", label: "PTU looseleaf" },
    { key: "ptuIssuedOn", label: "PTU issued", kind: "date" },
    { key: "orusRegistered", label: "ORUS registered" },
    { key: "siEmail", label: "Email (for SI)", kind: "email" },
    { key: "siAddress", label: "Address (for SI)", kind: "textarea", full: true },
  ] },
  { title: "Billing check", fields: [
    { key: "lastCheckedBilling", label: "Date last checked", kind: "date" },
    { key: "remarksBilling", label: "Remarks", kind: "textarea", full: true },
  ] },
  { title: "Payroll / AP", showWhen: (c) => !!(c.payrollClient || c.bank || c.accountNoLast4 || c.accountName || c.atc || c.classification || c.lastCheckedAp || c.remarksAp), fields: [
    { key: "payrollClient", label: "Payroll client" },
    { key: "bank", label: "Bank" },
    { key: "accountName", label: "Account name" },
    { key: "atc", label: "ATC" },
    { key: "classification", label: "Classification" },
    { key: "lastCheckedAp", label: "Date last checked", kind: "date" },
    { key: "remarksAp", label: "Remarks", kind: "textarea", full: true },
  ] },
  { title: "Documents", fields: [
    { key: "gdLink", label: "DDS GD link", kind: "url", full: true, placeholder: "https://drive.google.com/…" },
    { key: "lastCheckedDocs", label: "Date last checked", kind: "date" },
    { key: "remarksDocs", label: "Remarks", kind: "textarea", full: true },
  ] },
];

export const TIN_RE = /^\d{3}-\d{3}-\d{3}-\d{3,5}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same rules the server enforces; checked first so the error lands under the field without a round trip. */
export function validateCompanyDraft(d: Partial<CompanyValues>): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (d.name !== undefined && !d.name.trim()) errors.name = "Enter the registered name.";
  if (d.tin && !TIN_RE.test(d.tin.trim())) errors.tin = "Use 000-000-000-000 with 3 to 5 digits at the end.";
  if (d.siEmail && !EMAIL_RE.test(d.siEmail.trim())) errors.siEmail = "Enter a valid email address.";
  if (d.gdLink && !/^https:\/\/\S+$/.test(d.gdLink.trim())) errors.gdLink = "Use a full https:// link.";
  return errors;
}
