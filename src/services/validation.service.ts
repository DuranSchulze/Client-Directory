import { AppError } from "@/lib/errors";
import { EMAIL_RE, TIN_RE, nameKey, normEmail, nullText, toE164 } from "@/lib/normalize";
import { BILLING_ROLES, COMPANY_TYPES, EFPS, ENGAGEMENTS, ENTITIES } from "@/lib/enums";
import { COMPANY_DATE_FIELDS, COMPANY_TEXT_FIELDS } from "@/lib/api-types";
import type { CompanyPatch, ContactPatch, DeptEmailPatch, ProbityPatch, SupplierInput } from "@/lib/api-types";

export function invalid(field: string, message = "Invalid value"): never { throw new AppError(400, message, field); }
export function object(body: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError(400, "Expected an object");
  for (const key of Object.keys(body)) if (!keys.includes(key)) invalid(key, "Unknown or read-only field");
  return body as Record<string, unknown>;
}
export function id(value: unknown, field = "id"): number {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(field);
  return value;
}
export function text(value: unknown, field: string, required = false): string | null {
  if (value !== null && typeof value !== "string") invalid(field);
  const result = nullText(value);
  if (required && !result) invalid(field, "Required");
  return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[], field: string, nullable = false): T | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !choices.includes(value as T)) invalid(field);
  return value as T;
}
export function emails(value: unknown, field = "emails"): string[] {
  if (!Array.isArray(value)) invalid(field, "Expected a list of emails");
  return [...new Set(value.map((email) => {
    if (typeof email !== "string" || !EMAIL_RE.test(normEmail(email))) invalid(field, "Enter valid email addresses");
    return normEmail(email);
  }))];
}
export function phones(value: unknown): string[] {
  if (!Array.isArray(value)) invalid("phones");
  return [...new Set(value.map((phone) => {
    if (typeof phone !== "string") invalid("phones");
    return toE164(phone) ?? invalid("phones", "Enter valid phone numbers");
  }))];
}
export function date(value: unknown, field: string): string | null {
  const result = text(value, field);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)) invalid(field, "Use a valid YYYY-MM-DD date");
  return result;
}
function https(value: unknown, field: string): string | null {
  const result = text(value, field);
  if (result) {
    try { if (new URL(result).protocol !== "https:") invalid(field, "Use an https URL"); }
    catch { invalid(field, "Use an https URL"); }
  }
  return result;
}
export function validateCompany(body: unknown, partial = false): CompanyPatch {
  const values = object(body, ["name", ...COMPANY_TEXT_FIELDS, ...COMPANY_DATE_FIELDS, "accountNo", "type", "entities", "engagement", "isNew", "efps"]);
  const result: CompanyPatch = {};
  if (!partial || "name" in values) {
    result.name = text(values.name, "name", true)!.replace(/\s+/g, " ");
    if (!nameKey(result.name)) invalid("name", "Enter a registered name");
  }
  for (const key of COMPANY_TEXT_FIELDS) if (key in values) result[key] = text(values[key], key);
  for (const key of COMPANY_DATE_FIELDS) if (key in values) result[key] = date(values[key], key);
  if (result.tin && !TIN_RE.test(result.tin)) invalid("tin", "Use 123-456-789-000 format");
  if ("siEmail" in values && result.siEmail) result.siEmail = emails([result.siEmail], "siEmail")[0];
  if ("gdLink" in values) result.gdLink = https(values.gdLink, "gdLink");
  if ("accountNo" in values) result.accountNo = text(values.accountNo, "accountNo");
  if ("type" in values) result.type = choice(values.type, COMPANY_TYPES, "type")!;
  if ("engagement" in values) result.engagement = choice(values.engagement, ENGAGEMENTS, "engagement", true);
  if ("efps" in values) result.efps = choice(values.efps, EFPS, "efps", true);
  if ("isNew" in values) {
    if (typeof values.isNew !== "boolean") invalid("isNew");
    result.isNew = values.isNew;
  }
  if ("entities" in values) {
    if (!Array.isArray(values.entities)) invalid("entities");
    result.entities = [...new Set(values.entities.map((value) => choice(value, ENTITIES, "entities")!))];
  }
  return result;
}
export function validateContact(body: unknown, partial = false): ContactPatch {
  const values = object(body, ["name", "designation", "emails", "phones", "billingRole"]);
  const result: ContactPatch = {};
  for (const key of ["name", "designation"] as const) if (key in values) result[key] = text(values[key], key);
  if (!partial || "emails" in values) result.emails = emails(values.emails);
  if ("phones" in values) result.phones = phones(values.phones);
  if ("billingRole" in values) result.billingRole = choice(values.billingRole, BILLING_ROLES, "billingRole")!;
  return result;
}
export function validateProbity(body: unknown, partial = false): ProbityPatch {
  const values = object(body, ["companyListed", "companyId", "contactPerson", "emails", "service", "agreementUrl", "draftedOn", "referenceNo", "remarks"]);
  const result: ProbityPatch = {};
  if (!partial || "companyListed" in values) result.companyListed = text(values.companyListed, "companyListed", true)!;
  for (const key of ["contactPerson", "service", "referenceNo", "remarks"] as const) if (key in values) result[key] = text(values[key], key);
  if ("emails" in values) result.emails = emails(values.emails);
  if ("agreementUrl" in values) result.agreementUrl = https(values.agreementUrl, "agreementUrl");
  if ("draftedOn" in values) result.draftedOn = date(values.draftedOn, "draftedOn");
  if ("companyId" in values) result.companyId = values.companyId === null ? null : id(values.companyId, "companyId");
  return result;
}
export function validateSupplier(body: unknown): SupplierInput {
  const values = object(body, ["name", "particulars", "contactName", "emails", "phones"]);
  const result: SupplierInput = {};
  for (const key of ["name", "particulars", "contactName"] as const) if (key in values) result[key] = text(values[key], key);
  if ("emails" in values) result.emails = emails(values.emails);
  if ("phones" in values) result.phones = phones(values.phones);
  return result;
}
export function validateDeptEmail(body: unknown, partial = false): DeptEmailPatch {
  const values = object(body, ["department", "name", "title", "emails", "sortOrder"]);
  const result: DeptEmailPatch = {};
  if (!partial || "department" in values) result.department = text(values.department, "department", true)!;
  for (const key of ["name", "title"] as const) if (key in values) result[key] = text(values[key], key);
  if ("emails" in values) result.emails = emails(values.emails);
  if ("sortOrder" in values) {
    if (typeof values.sortOrder !== "number" || !Number.isSafeInteger(values.sortOrder) || values.sortOrder < 0 || values.sortOrder > 2147483647) invalid("sortOrder");
    result.sortOrder = values.sortOrder;
  }
  return result;
}
export async function jsonBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new AppError(400, "Invalid JSON body"); }
}
