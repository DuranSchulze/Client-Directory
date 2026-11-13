import { expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, withTransaction: vi.fn() }));

it("suggests by corporate domain and never by free-mail provider", async () => {
  const { suggestCompany } = await import("@/services/needs-company.service");
  const companies = [{ id: 1, name: "Acme" }, { id: 2, name: "Other" }];
  const contacts = [{ companyId: 1, emails: ["billing@acme.test", "owner@yahoo.com.ph"] }, { companyId: 2, emails: ["other@example.org"] }];
  const candidate = (email: string) => ({ id: 9, fields: { emails: { value: [email], source: "gmail", confidence: 1 } } });
  expect(suggestCompany(candidate("New@ACME.TEST"), companies, contacts)).toEqual({ companyId: 1, name: "Acme" });
  expect(suggestCompany(candidate("new@yahoo.com.ph"), companies, contacts)).toBeNull();
  expect(suggestCompany(candidate("new@unknown.test"), companies, contacts)).toBeNull();
  expect(suggestCompany({ id: 10, fields: {} }, companies, contacts)).toBeNull();
});
