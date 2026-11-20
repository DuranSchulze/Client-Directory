import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
// Candidate fixtures replace reads only; integration tests never write Scraper tables.
vi.mock("@/lib/auth/guard", () => ({ requireRouteAccess: async () => ({ email: "integration@example.test" }) }));
describe.skipIf(!process.env.TEST_DATABASE_URL)("automatic distribution transactions", () => {
  const companyIds: number[] = [];
  const files: string[] = [];
  async function fixtures() {
    vi.stubEnv("AUTO_DISTRIBUTE", "1"); vi.stubEnv("INTERNAL_DOMAINS", "");
    const domain = `${randomUUID()}.test`;
    const { createCompany } = await import("@/services/companies.service");
    const first = await createCompany({ name: `Distribution ${domain}`, contacts: [{ emails: [`billing@${domain}`] }] }, "integration@example.test");
    companyIds.push(first.id);
    const second = await createCompany({ name: `Attach ${domain}`, contacts: [{ emails: [`billing@other-${domain}`] }] }, "integration@example.test");
    companyIds.push(second.id);
    const candidates = await import("@/repositories/candidates.repository");
    const candidate = { id: 777, fields: { name: { value: "Pat", source: "gmail", confidence: 1 }, emails: { value: [`person@${domain}`], source: "gmail", confidence: 1 } } };
    vi.spyOn(candidates, "listDistributable").mockResolvedValue([candidate]);
    vi.spyOn(candidates, "findApprovedCandidate").mockResolvedValue(candidate);
    return { first, second, email: `person@${domain}` };
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    const { withTransaction } = await import("@/db");
    const { companies_tb, distribution_suppressions_tb, master_uploads_tb } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    await withTransaction(async (tx) => {
      if (companyIds.length) {
        await tx.delete(distribution_suppressions_tb).where(inArray(distribution_suppressions_tb.companyId, companyIds));
        await tx.delete(companies_tb).where(inArray(companies_tb.id, companyIds));
      }
      if (files.length) await tx.delete(master_uploads_tb).where(inArray(master_uploads_tb.fileName, files));
    });
    companyIds.length = 0; files.length = 0;
  }, 30000);
  it("serializes distribution against manual attachment without cross-company ownership", async () => {
    const { first, second, email } = await fixtures();
    const { distributeMatches } = await import("@/services/distribute.service");
    const { attachCandidate } = await import("@/services/needs-company.service");
    const { listContacts } = await import("@/repositories/contacts.repository");
    const outcomes = await Promise.allSettled([distributeMatches(), attachCandidate(777, { companyId: second.id })]);
    expect(outcomes[0].status).toBe("fulfilled");
    if (outcomes[1].status === "rejected") expect(outcomes[1].reason).toMatchObject({ status: 409 });
    const owners = (await listContacts()).filter((row) => row.emails.includes(email));
    expect(owners).toHaveLength(1);
    expect([first.id, second.id]).toContain(owners[0].companyId);
    expect((await distributeMatches()).added).toBe(0);
  }, 60000);
  it("rejects a stale manual attachment to the company that already gained the auto-contact", async () => {
    const { first, email } = await fixtures();
    const { distributeMatches } = await import("@/services/distribute.service");
    const { attachCandidate } = await import("@/services/needs-company.service");
    const { listContacts } = await import("@/repositories/contacts.repository");
    expect((await distributeMatches()).added).toBe(1);
    await expect(attachCandidate(777, { companyId: first.id })).rejects.toMatchObject({ status: 409, field: "emails" });
    expect((await listContacts(first.id)).filter((row) => row.emails.includes(email))).toHaveLength(1);
  }, 60000);
  it("links the distributed address even when the Scraper candidate has surrounding whitespace", async () => {
    const { first, email } = await fixtures();
    const { withTransaction } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { distributeMatches } = await import("@/services/distribute.service");
    const { listDistributable, listLinkedCandidates } = await import("@/repositories/candidates.repository");
    const fields = { emails: { value: [` \t${email.toUpperCase()}\r\n`], source: "gmail", confidence: 1 } };
    vi.mocked(listDistributable).mockResolvedValue([{ id: 777, fields }]);
    expect((await distributeMatches()).added).toBe(1);
    await withTransaction(async (tx) => {
      // Shadow the external table with this session's fixture, without modifying Scraper data.
      await tx.execute(sql`CREATE TEMP TABLE candidates (id bigint, review_state text, fields jsonb, reviewed jsonb) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO pg_temp.candidates (id, review_state, fields) VALUES (777, 'pending', ${JSON.stringify(fields)}::jsonb)`);
      expect(await listLinkedCandidates(first.id, tx)).toMatchObject([{ companyId: first.id, id: 777 }]);
    });
  }, 60000);
  it("suppresses deleted automatic emails but still permits manual attachment", async () => {
    const { first, second, email } = await fixtures();
    const { distributeMatches } = await import("@/services/distribute.service");
    const { listContacts } = await import("@/repositories/contacts.repository");
    const { removeContact } = await import("@/services/contacts.service");
    const { attachCandidate } = await import("@/services/needs-company.service");
    await distributeMatches();
    const auto = (await listContacts(first.id)).find((row) => row.emails.includes(email))!;
    expect(auto.source).toBe("scraper");
    await removeContact(first.id, auto.id);
    expect((await distributeMatches()).added).toBe(0);
    expect(await attachCandidate(777, { companyId: second.id })).toMatchObject({ companyId: second.id, emails: [email], source: null });
  }, 60000);
  it("skips while the session guard is held and releases it after a rollback", async () => {
    await fixtures();
    const { withTransaction } = await import("@/db");
    const { tryDistributionLock } = await import("@/repositories/ownership.repository");
    const { distributeMatches } = await import("@/services/distribute.service");
    await expect(withTransaction(async (tx) => {
      expect(await tryDistributionLock(tx)).toBe(true);
      expect(await distributeMatches()).toEqual({ added: 0, ambiguous: 0, skipped: 0 });
      throw new Error("Rollback guard holder");
    })).rejects.toThrow("Rollback guard holder");
    expect((await distributeMatches()).added).toBe(1);
  }, 60000);
  it("rolls an Excel move back on failure, then deletes the emptied auto-contact on commit", async () => {
    const { first, second, email } = await fixtures();
    const { distributeMatches } = await import("@/services/distribute.service");
    await distributeMatches(); vi.stubEnv("AUTO_DISTRIBUTE", "");
    const { listContacts } = await import("@/repositories/contacts.repository");
    const auto = (await listContacts(first.id)).find((row) => row.emails.includes(email))!;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["REGISTERED NAME", "EMAIL ADDRESS"], [second.name, email]]), "All Clients Database");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    const file = `${randomUUID()}.xlsx`; files.push(file);
    const { importWorkbook } = await import("@/services/import.service");
    const repo = await import("@/repositories/import.repository");
    vi.spyOn(repo, "insertMasterUpload").mockRejectedValueOnce(new Error("Late failure"));
    await expect(importWorkbook(buffer, false, "integration@example.test", file)).rejects.toThrow("Late failure");
    expect((await listContacts(first.id)).find((row) => row.id === auto.id)?.emails).toContain(email);
    expect((await listContacts(second.id)).some((row) => row.emails.includes(email))).toBe(false);
    await importWorkbook(buffer, false, "integration@example.test", file);
    expect((await listContacts(first.id)).some((row) => row.id === auto.id)).toBe(false);
    expect((await listContacts(second.id)).find((row) => row.emails.includes(email))?.source).toBeNull();
  }, 60000);
});
