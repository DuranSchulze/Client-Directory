import { drizzle } from "drizzle-orm/node-postgres";
import { expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: drizzle({ query } as never) }));
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: async () => {} }));
vi.mock("@/services/needs-company.service", () => ({ getNeedsQueue: async () => ({ items: [] }) }));

it("returns the unfiltered inquiry count on the directory counts route", async () => {
  query.mockImplementation(({ text }: { text: string }) => ({
    rows: text.includes('from "candidates"') ? [[7]] : text.includes('from "master_uploads"') ? [] : [[0]],
  }));
  const { GET } = await import("@/app/api/counts/route");
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ item: { inquiries: 7, needsCompany: 0 } });
  const inquiryQueries = query.mock.calls.filter(([statement]) => statement.text.includes('from "candidates"'));
  expect(inquiryQueries).toHaveLength(1);
  expect(inquiryQueries[0][0].text).toMatch(/^select count\(\*\) from "candidates" where /);
  expect(inquiryQueries[0][1]).toEqual(["pending", "approved", "status", "status", "status", "status", "status", "inquiry"]);
});
