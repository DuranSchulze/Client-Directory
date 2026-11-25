import { queryOptions } from "@tanstack/react-query";
import type {
  AccountsResponse, AuthResponse, CompaniesPage, CompaniesResponse, DeptEmailsPage, ProbityPage, SuppliersPage, RolesResponse, CompanyDetailResponse, CountsResponse, DeptEmailsResponse, InquiriesPage, InquiryTimeline,
  MasterUploadResponse, NeedsCompanyResponse, ProbityResponse, ScrapeStatus, SuppliersResponse,
} from "@/lib/api-types";
import { request } from "./http";

export const keys = {
  me: ["me"] as const,
  counts: ["counts"] as const,
  companies: ["companies"] as const,
  company: (id: number) => ["companies", "detail", id] as const,
  probity: ["probity"] as const,
  suppliers: ["suppliers"] as const,
  deptEmails: ["dept-emails"] as const,
  needsCompany: ["needs-company"] as const,
  inquiries: ["inquiries"] as const,
  users: ["users"] as const,
  roles: ["roles"] as const,
  masterUpload: ["master-upload"] as const,
  scrapeStatus: ["scrape-status"] as const,
};

// Grants can change from another session: re-read on focus and on every navigation (RouteGate), never served stale.
export const meQuery = queryOptions({ queryKey: keys.me, queryFn: () => request<AuthResponse>("/api/auth/me").then((r) => r.item), staleTime: 0, refetchOnWindowFocus: true });
export const countsQuery = queryOptions({ queryKey: keys.counts, queryFn: () => request<CountsResponse>("/api/counts").then((r) => r.item) });
export const companiesQuery = queryOptions({ queryKey: keys.companies, queryFn: () => request<CompaniesResponse>("/api/companies").then((r) => r.items) });
export const companyQuery = (id: number) => queryOptions({ queryKey: keys.company(id), queryFn: () => request<CompanyDetailResponse>(`/api/companies/${id}`).then((r) => r.item) });
export const probityQuery = queryOptions({ queryKey: keys.probity, queryFn: () => request<ProbityResponse>("/api/probity").then((r) => r.items) });
export const suppliersQuery = queryOptions({ queryKey: keys.suppliers, queryFn: () => request<SuppliersResponse>("/api/suppliers").then((r) => r.items) });
export const deptEmailsQuery = queryOptions({ queryKey: keys.deptEmails, queryFn: () => request<DeptEmailsResponse>("/api/dept-emails").then((r) => r.items) });
// The key starts with keys.needsCompany, so invalidating that prefix refreshes whichever page is open.
export const needsCompanyQuery = (page: number, size: number, q: string) => queryOptions({
  queryKey: [...keys.needsCompany, { page, size, q }] as const,
  queryFn: () => request<NeedsCompanyResponse>(`/api/needs-company?${new URLSearchParams({ page: String(page), size: String(size), q })}`),
});
// One page of a list. Keys sit under the module's key, so invalidating keys.probity (etc.) refreshes full-list and paged data alike.
export type PageParams = Record<string, string>;
const pagedQuery = <T,>(root: readonly string[], path: string) => (params: PageParams) => queryOptions({
  queryKey: [...root, "page", params] as const,
  queryFn: ({ signal }) => request<T>(`${path}?${new URLSearchParams(params)}`, { signal }),
});
export const companiesPageQuery = pagedQuery<CompaniesPage>(keys.companies, "/api/companies");
export const probityPageQuery = pagedQuery<ProbityPage>(keys.probity, "/api/probity");
export const suppliersPageQuery = pagedQuery<SuppliersPage>(keys.suppliers, "/api/suppliers");
export const deptEmailsPageQuery = pagedQuery<DeptEmailsPage>(keys.deptEmails, "/api/dept-emails");
export const inquiriesPageQuery = pagedQuery<InquiriesPage>(keys.inquiries, "/api/inquiries");
export const inquiryTimelineQuery = (id: number) => queryOptions({
  queryKey: [...keys.inquiries, "timeline", id] as const,
  queryFn: () => request<{ item: InquiryTimeline }>(`/api/inquiries/${id}/timeline`).then((r) => r.item),
});
export const masterUploadQuery = queryOptions({ queryKey: keys.masterUpload, queryFn: () => request<MasterUploadResponse>("/api/import/xlsx").then((r) => r.item.lastMasterUpload) });
export const usersQuery = queryOptions({ queryKey: keys.users, queryFn: () => request<AccountsResponse>("/api/users").then((r) => r.items) });
export const rolesQuery = queryOptions({ queryKey: keys.roles, queryFn: () => request<RolesResponse>("/api/roles").then((r) => r.items) });
// Poll faster while a scrape runs so the bar ends close to when the run does.
export const scrapeStatusQuery = queryOptions({
  queryKey: keys.scrapeStatus,
  queryFn: () => request<{ item: ScrapeStatus }>("/api/scrape-status").then((r) => r.item),
  refetchInterval: (q) => (q.state.data?.running ? 15_000 : 60_000),
});
