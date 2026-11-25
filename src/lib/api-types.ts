import type { BillingRole, CompanyType, Engagement, Entity, MatchedBy, Stage } from "./enums";
import type { CandidateFields, Payment, StageAmount, TimelineItem } from "./candidate-types";
import type { RouteKey } from "./routes";

export const COMPANY_TEXT_FIELDS = ["alias", "tradeName", "acctgService", "supervisor", "assistant", "tin", "branchCode", "rdoCode", "zip", "address", "siEmail", "siAddress", "secNo", "boaClass", "bookletClass", "ptuLooseleaf", "orusRegistered", "remarksBilling", "payrollClient", "bank", "accountName", "atc", "classification", "remarksAp", "gdLink", "remarksDocs"] as const;
export const COMPANY_DATE_FIELDS = ["incorporatedOn", "registeredOn", "yearEnd", "ptuIssuedOn", "lastCheckedBilling", "lastCheckedAp", "lastCheckedDocs"] as const;
export type CompanyValues = Record<(typeof COMPANY_TEXT_FIELDS)[number] | (typeof COMPANY_DATE_FIELDS)[number], string | null> & {
  name: string; type: CompanyType; entities: Entity[]; engagement: Engagement | null; isNew: boolean; efps: "eBIR" | "eFPS" | "VDS" | null;
};
export type CompanyInput = Partial<CompanyValues> & { name: string; accountNo?: string | null };
export type CompanyPatch = Partial<CompanyInput>;
export type ContactInput = { name?: string | null; designation?: string | null; emails: string[]; phones?: string[]; billingRole?: BillingRole };
export type ContactPatch = Partial<ContactInput>;
export type CreateCompanyBody = CompanyInput & { contacts: ContactInput[] };
export type CompanyItem = CompanyValues & { id: number; nameKey: string; accountNoLast4: string | null; createdBy: string | null; createdAt: string; updatedAt: string };
export type ContactItem = { id: number; companyId: number; name: string | null; designation: string | null; emails: string[]; phones: string[]; billingRole: BillingRole; source: string | null; updatedAt: string };
export type GmailRollup = { stage: Stage | null; lastContact: string | null; needsCheck: string[]; candidateIds: number[] };
export type CompanyListItem = CompanyItem & { contacts: ContactItem[]; gmail: GmailRollup; probity: boolean };
export type CandidateItem = { id: number; fields: CandidateFields };
type InquiryField = "name" | "company" | "emails" | "stage" | "department" | "services" | "first_contact" | "last_contact";
export type Inquiry = {
  id: number;
  reviewState: "pending" | "approved";
  fields: {
    [K in InquiryField]: { value: NonNullable<CandidateFields[K]>["value"] | null; source?: string; confidence?: number } | null;
  };
  client: { companyId: number; name: string } | null;
};
export type InquiryTimeline = { items: TimelineItem[]; truncated: boolean };
export type Activity = {
  candidates: CandidateItem[]; stage: Stage | null; stageDates: Partial<Record<Stage, string>>;
  summary: {
    stage: Stage | null; firstContact: string | null; lastContact: string | null;
    // Distinct raw items in the available timelines, capped by Scraper at 200 items per candidate.
    messages: number; latestSubjects: string[];
  };
  amounts: StageAmount[]; payments: Payment[]; timeline: { items: TimelineItem[]; truncated: boolean }; needsCheck: string[];
};
export type ProbityInput = {
  companyListed: string; companyId?: number | null; contactPerson?: string | null; emails?: string[];
  service?: string | null; agreementUrl?: string | null; draftedOn?: string | null; referenceNo?: string | null; remarks?: string | null;
};
export type ProbityPatch = Partial<ProbityInput>;
export type ProbityItem = {
  id: number; companyListed: string; companyId: number | null; matchedBy: MatchedBy | null; companyName: string | null;
  contactPerson: string | null; emails: string[]; service: string | null; agreementUrl: string | null;
  draftedOn: string | null; referenceNo: string | null; remarks: string | null; updatedAt: string;
};
export type SupplierInput = { name?: string | null; particulars?: string | null; contactName?: string | null; emails?: string[]; phones?: string[] };
export type SupplierItem = Required<SupplierInput> & { id: number; updatedAt: string };
export type DeptEmailInput = { department: string; name?: string | null; title?: string | null; emails?: string[]; sortOrder?: number };
export type DeptEmailPatch = Partial<DeptEmailInput>;
export type DeptEmailItem = Required<DeptEmailInput> & { id: number };
export type CompanyDetail = {
  company: CompanyItem; contacts: ContactItem[]; probity: ProbityItem[]; activity: Activity; reveals: { userEmail: string; at: string }[];
};
export type NeedsCompanyItem = CandidateItem & { suggestion: { companyId: number; name: string } | null };
export type NeedsCompanyPage = { items: NeedsCompanyItem[]; total: number; suggested: number };
export type ScrapeStatus = { running: { startedAt: string; completed: number } | null; nextAt: string | null; lastFinishedAt: string | null };
export type AttachAllResult = { attached: number; skipped: number; contacts: { id: number; companyId: number }[] };
export type LastMasterUpload = { at: string; by: string; fileName: string };
export type MasterUploadResponse = ItemResponse<{ lastMasterUpload: LastMasterUpload | null }>;
export type Counts = { companies: number; probity: number; probityUnmatched: number; needsCompany: number; inquiries: number; suppliers: number; deptEmails: number; lastMasterUpload: LastMasterUpload | null };
export type ApiError = { error: string; field?: string };
export type ItemResponse<T> = { item: T };
export type ListResponse<T> = { items: T[] };
type ListPage<T> = ListResponse<T> & { total: number; all: number };
export type CompaniesPage = ListPage<CompanyListItem> & {
  kpi: { active: number; inactive: number; isNew: number; newActive: number; unset: number };
  chipCounts: Record<"check" | "recheck" | "tin" | "probity" | "nogmail", number>;
  facets: { services: string[]; supervisors: string[] };
};
export type ProbityPage = ListPage<ProbityItem> & { matched: number };
export type InquiriesPage = ListPage<Inquiry>;
export type SuppliersPage = ListPage<SupplierItem>;
export type DeptEmailsPage = ListPage<DeptEmailItem> & { departments: { department: string; count: number }[] };
export type DeleteResponse = { ok: true };
export type LoginBody = { email: string; password: string };
export type SessionUser = { id: number; email: string; name: string; role: { id: number; name: string }; routes: RouteKey[] };
export type Role = { id: number; name: string; routes: RouteKey[]; locked: boolean; users: number };
export type Account = SessionUser & { active: boolean; createdAt: string };
export type RoleInput = { name: string; routes: RouteKey[] };
export type AccountInput = { name: string; email: string; password: string; roleId: number };
export type AccountRoleInput = { roleId: number };
export type RolesResponse = ListResponse<Role>;
export type RoleResponse = ItemResponse<Role>;
export type AccountsResponse = ListResponse<Account>;
export type AccountResponse = ItemResponse<Account>;
export type AuthResponse = ItemResponse<SessionUser>;
export type CompaniesResponse = ListResponse<CompanyListItem>;
export type CompanyResponse = ItemResponse<CompanyItem>;
export type CompanyDetailResponse = ItemResponse<CompanyDetail>;
export type ContactResponse = ItemResponse<ContactItem>;
export type ContactsResponse = ListResponse<ContactItem>;
export type ProbityResponse = ListResponse<ProbityItem>;
export type ProbityItemResponse = ItemResponse<ProbityItem>;
export type SuppliersResponse = ListResponse<SupplierItem>;
export type SupplierResponse = ItemResponse<SupplierItem>;
export type DeptEmailsResponse = ListResponse<DeptEmailItem>;
export type DeptEmailResponse = ItemResponse<DeptEmailItem>;
export type NeedsCompanyResponse = NeedsCompanyPage;
export type AttachBody = { companyId: number };
export type RevealAccountResponse = ItemResponse<{ accountNo: string | null }>;
export type CountsResponse = ItemResponse<Counts>;
export type { ImportPreview, ImportResult, ImportIssue, ImportBuckets, ImportPreviewResponse, ImportCommitResponse } from "./import/contract";
