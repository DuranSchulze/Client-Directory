import { bigserial, boolean, date, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CompanyType, Engagement } from "../../lib/enums";
import { sql } from "drizzle-orm";

// One row per "All Clients Database" row. Sheet headers in brackets.
export const companies_tb = pgTable("companies", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // Identity
  name: text("name").notNull(),                                   // [REGISTERED NAME]
  nameKey: text("name_key").notNull(),                            // normalized, lib/normalize.ts nameKey
  alias: text("alias"),                                           // [ALIAS]
  tradeName: text("trade_name"),                                  // [TRADE NAME]
  type: text("type").$type<CompanyType>().notNull().default("Non-individual"),
  entities: text("entities").array().notNull().default([]),       // [INTERCOMPANY]
  // Engagement
  engagement: text("engagement").$type<Engagement>(),             // null = "Not set"
  isNew: boolean("is_new").notNull().default(false),
  acctgService: text("acctg_service"),
  efps: text("efps"),                                             // eBIR | eFPS | VDS
  supervisor: text("supervisor"),
  assistant: text("assistant"),
  // BIR & SEC
  tin: text("tin"), branchCode: text("branch_code"), rdoCode: text("rdo_code"), zip: text("zip"),
  address: text("address"),
  siEmail: text("si_email"), siAddress: text("si_address"),
  secNo: text("sec_no"),
  incorporatedOn: date("incorporated_on", { mode: "string" }),
  registeredOn: date("registered_on", { mode: "string" }),
  yearEnd: date("year_end", { mode: "string" }),
  boaClass: text("boa_class"), bookletClass: text("booklet_class"),
  ptuLooseleaf: text("ptu_looseleaf"), ptuIssuedOn: date("ptu_issued_on", { mode: "string" }),
  orusRegistered: text("orus_registered"),
  // Billing check
  lastCheckedBilling: date("last_checked_billing", { mode: "string" }),
  remarksBilling: text("remarks_billing"),
  // Payroll / AP
  payrollClient: text("payroll_client"), bank: text("bank"),
  accountNo: text("account_no"),            // AES-256-GCM ciphertext (iv:tag:data, base64)
  accountNoLast4: text("account_no_last4"), // plain, for the masked display
  accountName: text("account_name"), atc: text("atc"), classification: text("classification"),
  lastCheckedAp: date("last_checked_ap", { mode: "string" }), remarksAp: text("remarks_ap"),
  // Documents
  gdLink: text("gd_link"),
  lastCheckedDocs: date("last_checked_docs", { mode: "string" }), remarksDocs: text("remarks_docs"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_companies_name_key").on(t.nameKey),
  uniqueIndex("uq_companies_tin_branch").on(t.tin, sql`coalesce(${t.branchCode}, '')`).where(sql`${t.tin} IS NOT NULL`),
  index("idx_companies_tin").on(t.tin),
]);

export type CompanyRow = typeof companies_tb.$inferSelect;
export type CompanyInsert = typeof companies_tb.$inferInsert;
