import type { CompanyRow } from "@/db/schema/companies";
import type { ContactRow } from "@/db/schema/contacts";
import type { ProbityRow } from "@/db/schema/probity-clients";
import type { SupplierRow } from "@/db/schema/suppliers";
import type { DeptEmailRow } from "@/db/schema/dept-emails";
import { COMPANY_DATE_FIELDS, COMPANY_TEXT_FIELDS } from "./api-types";
import type { CompanyItem, ContactItem, DeptEmailItem, ProbityItem, SupplierItem } from "./api-types";

export function companyDto(row: CompanyRow): CompanyItem {
  const fields = Object.fromEntries([...COMPANY_TEXT_FIELDS, ...COMPANY_DATE_FIELDS].map((key) => [key, row[key] ?? null]));
  return { ...fields, id: row.id, name: row.name, nameKey: row.nameKey, type: row.type, entities: row.entities,
    engagement: row.engagement, isNew: row.isNew, efps: row.efps, accountNoLast4: row.accountNoLast4,
    createdBy: row.createdBy, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } as CompanyItem;
}
export function contactDto(row: ContactRow): ContactItem {
  return { id: row.id, companyId: row.companyId, name: row.name, designation: row.designation, emails: row.emails,
    phones: row.phones, billingRole: row.billingRole, updatedAt: row.updatedAt.toISOString() };
}
export function probityDto(row: ProbityRow, companyName: string | null): ProbityItem {
  return { id: row.id, companyListed: row.companyListed, companyId: row.companyId, companyName, matchedBy: row.matchedBy,
    contactPerson: row.contactPerson, emails: row.emails, service: row.service, agreementUrl: row.agreementUrl,
    draftedOn: row.draftedOn, referenceNo: row.referenceNo, remarks: row.remarks, updatedAt: row.updatedAt.toISOString() };
}
export function supplierDto(row: SupplierRow): SupplierItem {
  return { id: row.id, name: row.name, particulars: row.particulars, contactName: row.contactName,
    emails: row.emails, phones: row.phones, updatedAt: row.updatedAt.toISOString() };
}
export function deptEmailDto(row: DeptEmailRow): DeptEmailItem {
  return { id: row.id, department: row.department, name: row.name, title: row.title, emails: row.emails, sortOrder: row.sortOrder };
}
