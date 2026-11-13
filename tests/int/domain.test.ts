import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

describe.skipIf(!process.env.TEST_DATABASE_URL)("domain transaction rules", () => {
  const companyIds: number[] = [];
  const deptIds: number[] = [];
  async function create(label: string, email: string, extra: Record<string, unknown> = {}) {
    const { createCompany } = await import("@/services/companies.service");
    const row = await createCompany({ name: `${label} ${randomUUID()}`, contacts: [{ emails: [email] }], ...extra }, "integration@example.test");
    companyIds.push(row.id);
    return row;
  }
  afterEach(async () => {
    const { withTransaction } = await import("@/db");
    const { companies_tb, dept_emails_tb } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    await withTransaction(async (tx) => {
      if (companyIds.length) await tx.delete(companies_tb).where(inArray(companies_tb.id, companyIds));
      if (deptIds.length) await tx.delete(dept_emails_tb).where(inArray(dept_emails_tb.id, deptIds));
    });
    companyIds.length = 0; deptIds.length = 0;
  }, 30000);
  it("serializes concurrent duplicate emails and rolls back the losing company", async () => {
    const email = `${randomUUID()}@example.test`;
    const label = randomUUID();
    const results = await Promise.allSettled([create(`${label} First`, email), create(`${label} Second`, email.toUpperCase())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, field: "emails" });
    const { listContacts } = await import("@/repositories/contacts.repository");
    const { listCompanies } = await import("@/repositories/companies.repository");
    expect((await listContacts()).filter((contact) => contact.emails.includes(email))).toHaveLength(1);
    expect((await listCompanies()).filter((company) => company.name.startsWith(label))).toHaveLength(1);
  }, 30000);
  it("enforces TIN/branch uniqueness concurrently and allows different branches", async () => {
    const tin = `${randomInt(100, 999)}-${randomInt(100, 999)}-${randomInt(100, 999)}-000`;
    const results = await Promise.allSettled([
      create("Branch A", `${randomUUID()}@example.test`, { tin, branchCode: null }),
      create("Branch B", `${randomUUID()}@example.test`, { tin, branchCode: "" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 409, field: "tin" });
    expect(await create("Branch C", `${randomUUID()}@example.test`, { tin, branchCode: "00001" })).toMatchObject({ tin, branchCode: "00001" });
  }, 30000);
  it("leaves one main after concurrent make-main and protects deletion/demotion", async () => {
    const { saveContact, removeContact } = await import("@/services/contacts.service");
    const { listContacts } = await import("@/repositories/contacts.repository");
    const company = await create("Main race", `${randomUUID()}@example.test`);
    const first = (await listContacts(company.id))[0];
    await expect(removeContact(company.id, first.id)).rejects.toMatchObject({ status: 409 });
    const second = await saveContact(company.id, { emails: [`${randomUUID()}@example.test`], billingRole: "cc" });
    await expect(removeContact(company.id, first.id)).rejects.toMatchObject({ status: 409, message: "Make another contact main first" });
    await expect(saveContact(company.id, { billingRole: "cc" }, first.id)).rejects.toMatchObject({ status: 409, message: "Make another contact main first" });
    await Promise.all([saveContact(company.id, { billingRole: "main" }, first.id), saveContact(company.id, { billingRole: "main" }, second.id)]);
    const contacts = await listContacts(company.id);
    expect(contacts.filter((contact) => contact.billingRole === "main")).toHaveLength(1);
    const cc = contacts.find((contact) => contact.billingRole === "cc")!;
    await removeContact(company.id, cc.id);
    expect(await listContacts(company.id)).toHaveLength(1);
  }, 30000);
  it("serializes department and contact ownership writes against each other", async () => {
    const { saveDeptEmail } = await import("@/services/dept-emails.service");
    const email = `${randomUUID()}@example.test`;
    const results = await Promise.allSettled([
      create("Client ownership", email),
      saveDeptEmail({ department: "Integration", emails: [email] }).then((row) => { deptIds.push(row.id); return row; }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
  }, 30000);
});
