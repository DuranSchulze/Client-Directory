import "server-only";
import { withTransaction } from "@/db";
import { EMAIL_RE, isFreeMail, normEmail } from "@/lib/normalize";
import { listDistributable } from "@/repositories/candidates.repository";
import { insertContact, listContacts } from "@/repositories/contacts.repository";
import { listDeptEmails } from "@/repositories/dept-emails.repository";
import { listSuppressions, lockEmailOwnership, tryDistributionLock } from "@/repositories/ownership.repository";
import { domainCompanies } from "./needs-company.service";
import { refreshProbityMatches } from "./probity.service";

export async function distributeMatches() {
  const result = { added: 0, ambiguous: 0, skipped: 0 };
  if (process.env.AUTO_DISTRIBUTE !== "1") return result;
  return withTransaction(async (tx) => {
    if (!await tryDistributionLock(tx)) return result;
    await lockEmailOwnership(tx);
    const [candidates, contacts, dept, suppressions] = await Promise.all([
      listDistributable(tx), listContacts(undefined, tx), listDeptEmails(tx), listSuppressions(tx),
    ]);
    const blocked = new Set([...contacts.flatMap((c) => c.emails), ...dept.flatMap((c) => c.emails), ...suppressions.map((s) => s.email)].map(normEmail));
    const internal = new Set((process.env.INTERNAL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean));
    const evidence = contacts.filter((c) => c.source === null).map((c) => ({ companyId: c.companyId, emails: c.emails.map(normEmail) }));
    for (const candidate of candidates) {
      const raw = candidate.fields.emails?.value;
      const addresses = [...new Set(Array.isArray(raw) ? raw.filter((e): e is string => typeof e === "string").map(normEmail).filter((e) => EMAIL_RE.test(e)) : [])];
      if (!addresses.length || addresses.some((e) => blocked.has(e))) { result.skipped++; continue; }
      const domains = new Set(addresses.map((e) => e.split("@")[1]).filter((d) => !isFreeMail(d) && !internal.has(d)));
      const matches = domainCompanies(domains, evidence);
      if (matches.size > 1) { result.ambiguous++; continue; }
      if (!matches.size) { result.skipped++; continue; }
      const companyId = [...matches][0];
      const matching = addresses.filter((e) => domains.has(e.split("@")[1]) && domainCompanies(new Set([e.split("@")[1]]), evidence).has(companyId));
      await insertContact({ companyId, emails: matching, name: typeof candidate.fields.name?.value === "string" ? candidate.fields.name.value : null, billingRole: "cc", source: "scraper" }, tx);
      for (const email of matching) blocked.add(email);
      result.added++;
    }
    if (result.added) await refreshProbityMatches(tx);
    return result;
  });
}
