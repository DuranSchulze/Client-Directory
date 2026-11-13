import { queryOptions } from "@tanstack/react-query";
import type {
  AccountsResponse, AuthResponse, CompaniesResponse, RolesResponse, CompanyDetailResponse, CountsResponse, DeptEmailsResponse,
  NeedsCompanyResponse, ProbityResponse, SuppliersResponse,
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
  users: ["users"] as const,
  roles: ["roles"] as const,
};

// Grants can change from another session: re-read on focus and on every navigation (RouteGate), never served stale.
export const meQuery = queryOptions({ queryKey: keys.me, queryFn: () => request<AuthResponse>("/api/auth/me").then((r) => r.item), staleTime: 0, refetchOnWindowFocus: true });
export const countsQuery = queryOptions({ queryKey: keys.counts, queryFn: () => request<CountsResponse>("/api/counts").then((r) => r.item) });
export const companiesQuery = queryOptions({ queryKey: keys.companies, queryFn: () => request<CompaniesResponse>("/api/companies").then((r) => r.items) });
export const companyQuery = (id: number) => queryOptions({ queryKey: keys.company(id), queryFn: () => request<CompanyDetailResponse>(`/api/companies/${id}`).then((r) => r.item) });
export const probityQuery = queryOptions({ queryKey: keys.probity, queryFn: () => request<ProbityResponse>("/api/probity").then((r) => r.items) });
export const suppliersQuery = queryOptions({ queryKey: keys.suppliers, queryFn: () => request<SuppliersResponse>("/api/suppliers").then((r) => r.items) });
export const deptEmailsQuery = queryOptions({ queryKey: keys.deptEmails, queryFn: () => request<DeptEmailsResponse>("/api/dept-emails").then((r) => r.items) });
export const needsCompanyQuery = queryOptions({ queryKey: keys.needsCompany, queryFn: () => request<NeedsCompanyResponse>("/api/needs-company").then((r) => r.items) });
export const usersQuery = queryOptions({ queryKey: keys.users, queryFn: () => request<AccountsResponse>("/api/users").then((r) => r.items) });
export const rolesQuery = queryOptions({ queryKey: keys.roles, queryFn: () => request<RolesResponse>("/api/roles").then((r) => r.items) });
