# Client Directory: build reference

The admin directory that replaces the accounting Excel (`Clients Database.xlsx`). The sheet's **All Clients Database** tab is the source of truth and becomes the `companies` table. Three other tabs become their own lists:

- **Probity Clients** is cross-checked against the clients, and matched clients are tagged.
- **OPS Supplier** is a separate supplier list.
- **All Dept. Emails** is the internal staff mailbox list.

The Scraper's approved Gmail conversations appear next to each client, matched by contact email.

**One shared master list.** `companies` + `contacts` are the accounting master list for both apps. The directory writes them (Excel import, then edits). The Scraper reads them, read-only, to tag its pending Gmail candidates (section 4). There is no second copy of the list.

The visual reference is `mock/client-directory.html`, a single static file with made-up sample data. Open it in a browser. Every page, field, rule and empty state below is in the mock.

## 1. Scope and ownership

| | Directory (this app) | Scraper (separate app) |
|---|---|---|
| Purpose | Keep client records (the master list) and show activity | Scrape Gmail, tag against the master list, review, approve |
| Writes | `companies`, `contacts`, `probity_clients`, `suppliers`, `dept_emails`, `sensitive_reveals`, `directory_users` | `candidates` (incl. `master_match`, `master_ids`), `clients`, `raw_items`, `signals`, `users`, `roles`, … |
| Reads | its own tables + `candidates` (read-only) | its own tables + `companies`, `contacts` (read-only) |
| Sign-in | its own login (`directory_users`) | its own login (`users` + custom `roles`) |
| Database | the same Neon Postgres database | the same |

Rules:
- The directory **never writes** to Scraper tables. The Scraper **never writes** to directory tables; it only reads `companies` and `contacts`.
- A Gmail candidate belongs to a client when one of its emails is on one of that client's contacts. In the directory this link is **derived on read**; the directory stores nothing on `candidates`.
- The Scraper keeps its own tag on **pending** candidates (`master_match` = `email` | `domain`, `master_ids` = `companies.id[]`) for its review timeline. The rule is in section 4. The directory may read these columns but never sets them.
- **Table names:** the Scraper already owns `users`, `roles`, `jobs`, `schedule`, `clients` and the rest in the same database. Never create a directory table with a Scraper name; directory tables are only those in `tablesFilter` (section 3).
- Emails in `dept_emails` are internal. They are never clients, and they never land in the Needs company queue.

## 2. Stack (from `/bootstrap` starter kit, adapted for Neon + serverless)

Follow `starter-kit.md` in the dev-brain vault in order. The changes below are deliberate.

| Starter kit default | Here | Why |
|---|---|---|
| MySQL, `mysql2` pool | **Neon Postgres**, `@neondatabase/serverless` + `drizzle-orm/neon-http` | Same database as the Scraper; serverless deploy |
| `next.config` `output: "standalone"`, `serverExternalPackages: ["mysql2", …]` | Default Vercel serverless output; no `serverExternalPackages` | No long-lived pool; HTTP driver per request |
| Pool singleton on `globalThis` | One `db` module exporting `drizzle(neon(DATABASE_URL))` | The HTTP driver is stateless, so no singleton is needed |
| MySQL column types | `pgTable`, `bigserial`, `text().array()`, `date({mode:"string"})`, `timestamp({ withTimezone: true })` | Postgres |
| Palette A (green), Poppins | **Metric Slate Gold tokens + Manrope** (copy `:root` / `html[data-theme=light]` from the mock or Scraper `frontend/src/app/globals.css`) | Matches the Scraper and DESIGN.md |
| `db.transaction` | `neon-http` has no interactive transactions: use `db.batch([...])` for multi-statement writes, or `drizzle-orm/neon-serverless` (WebSocket `Pool`) inside a route that needs a real transaction (client + first contact, the import commit) | Driver limit |

Everything else stays as the starter kit says:
- Next 16 App Router, React 19, TS strict, Tailwind v4, shadcn `base-nova`.
- TanStack Query v5, `request<T>()`, query-key factories.
- Route → service → repository; only repositories import `db`.
- Hand-written validation in services from `as const` allow-lists; no zod and no form library.
- jose cookie session with a seeded admin; `proxy.ts` gating. Accounts live in **`directory_users`**; the Scraper already owns `users` in the same database. The directory login is separate from the Scraper's.
- sonner toasts; `data-table-card`, `kpi-card`, `empty-state`, `loadable`, `confirm-dialog`, `xlsx-import-dialog`.

Packages:
```bash
npm i drizzle-orm @neondatabase/serverless @tanstack/react-query jose bcryptjs sonner cmdk lucide-react tw-animate-css clsx tailwind-merge server-only xlsx libphonenumber-js
npm i -D drizzle-kit dotenv tsx vitest
```

`.env` (drizzle-kit only auto-loads `.env`):
```
DATABASE_URL=postgres://…neon.tech/…?sslmode=require   # same DB as the Scraper
SESSION_SECRET=…
ACCOUNT_NO_KEY=…   # 32 random bytes, base64; rotate by re-encrypting
```

## 3. Drizzle setup

`drizzle.config.ts`: **`tablesFilter` is mandatory.** Without it, `drizzle-kit push` sees the Scraper's tables as unknown and offers to drop them.
```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  dbCredentials: { url: process.env.DATABASE_URL! },
  tablesFilter: ["companies", "contacts", "probity_clients", "suppliers", "dept_emails", "sensitive_reveals", "directory_users"], // never scraper tables
  strict: true,
});
```

`src/db/index.ts`:
```ts
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export const db = drizzle(neon(process.env.DATABASE_URL!));
```

### `companies` (one row per All Clients Database row)

Column groups follow the sheet. Each line shows the sheet header in brackets.

```ts
export const ENTITIES = ["FILEPINO", "DDS", "AKASYA", "MCADS UB", "THS"] as const;   // [INTERCOMPANY]
export const ENGAGEMENTS = ["active", "inactive"] as const;                            // [ENGAGEMENT STATUS]
export const COMPANY_TYPES = ["Non-individual", "Individual"] as const;               // [NON-INDIVIDUAL]/[INDIVIDUAL]

export const companies_tb = pgTable("companies", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // Identity
  name: text("name").notNull(),                                   // [REGISTERED NAME]
  nameKey: text("name_key").notNull(),                            // normalized, section 6
  alias: text("alias"),                                           // [ALIAS]
  tradeName: text("trade_name"),                                  // [TRADE NAME]
  type: text("type").$type<(typeof COMPANY_TYPES)[number]>().notNull().default("Non-individual"),
  entities: text("entities").array().notNull().default([]),       // [INTERCOMPANY] "DDS, FILEPINO"
  // Engagement
  engagement: text("engagement").$type<(typeof ENGAGEMENTS)[number]>(), // null = "Not set"
  isNew: boolean("is_new").notNull().default(false),              // the NEW part of "NEW, ACTIVE"
  acctgService: text("acctg_service"),                            // [ACCTG SERVICE]
  efps: text("efps"),                                             // [EFPS/EBIR] eBIR | eFPS | VDS
  supervisor: text("supervisor"),                                 // [ASSIGNED SUPERVISOR]
  assistant: text("assistant"),                                   // [ASSIGNED ASSISTANT]
  // BIR & SEC
  tin: text("tin"), branchCode: text("branch_code"), rdoCode: text("rdo_code"), zip: text("zip"),
  address: text("address"),                                       // [COMPANY'S REGISTERED ADDRESS]
  siEmail: text("si_email"), siAddress: text("si_address"),       // [Email (for SI)] [Address (for SI)]
  secNo: text("sec_no"),                                          // [SEC REGISTRATION NO.]
  incorporatedOn: date("incorporated_on", { mode: "string" }),    // [DATE OF INCORPORATION]
  registeredOn: date("registered_on", { mode: "string" }),        // [COMPANY REGISTRATION DATE]
  yearEnd: date("year_end", { mode: "string" }),
  boaClass: text("boa_class"), bookletClass: text("booklet_class"),
  ptuLooseleaf: text("ptu_looseleaf"), ptuIssuedOn: date("ptu_issued_on", { mode: "string" }),
  orusRegistered: text("orus_registered"),
  // Billing check
  lastCheckedBilling: date("last_checked_billing", { mode: "string" }), // [DATE LAST CHECKED (BILLING)]
  remarksBilling: text("remarks_billing"),
  // Payroll / AP: see "Sensitive fields" below
  payrollClient: text("payroll_client"), bank: text("bank"),
  accountNo: text("account_no"),            // AES-256-GCM ciphertext (iv:tag:data, base64)
  accountNoLast4: text("account_no_last4"), // plain, for the masked display
  accountName: text("account_name"), atc: text("atc"), classification: text("classification"),
  lastCheckedAp: date("last_checked_ap", { mode: "string" }), remarksAp: text("remarks_ap"),
  // Documents
  gdLink: text("gd_link"),                                        // [DDS GD Link]
  lastCheckedDocs: date("last_checked_docs", { mode: "string" }), remarksDocs: text("remarks_docs"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_companies_name_key").on(t.nameKey),
  index("idx_companies_tin").on(t.tin),
]);
```
- The sheet's working columns are **not imported**: `PROPOSE CHANGES`, `MA'AM GHEL APPROVAL`, the three `TIMESTAMP` checkbox columns and `CLIENT (FOR PAYROLL)` notes. Their job (review before change) is done by the edit flow and `updated_at`.
- **Sensitive fields (decided 2026-11-12: store, masked + logged):** `account_no` is a bank account number.
  - Encrypt it at rest with AES-256-GCM. The key is `ACCOUNT_NO_KEY` in env, never in the DB.
  - Store the ciphertext in `account_no` and the last 4 digits in plain `account_no_last4`, so the list never decrypts.
  - Everywhere it shows masked (`•••• 7890`). The API never returns the full number except from the reveal route.
  - Reveal: an admin clicks **Reveal**, which calls `POST /api/companies/[id]/reveal-account`.
    - The route re-checks the session and role, decrypts, writes one row to `sensitive_reveals`, and returns the number.
    - The UI shows it for 30 s, then masks it again.
    - The response is never cached.
  - Never include it in CSV export, logs, error messages or toasts.

### `directory_users` (directory login; separate from the Scraper's `users`)

```ts
export const directory_users_tb = pgTable("directory_users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),                 // lower-cased on write
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),  // bcryptjs
  role: text("role").$type<"admin">().notNull().default("admin"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_directory_users_email").on(t.email)]);
```
- Seeded from `DIRECTORY_ADMIN_EMAIL` / `DIRECTORY_ADMIN_PASSWORD` when empty. Admin only for now (open question in section 8).

### `sensitive_reveals` (audit log, append-only)

```ts
export const sensitive_reveals_tb = pgTable("sensitive_reveals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: bigint("company_id", { mode: "number" }).notNull(),
  field: text("field").notNull(),                 // "account_no"
  userEmail: text("user_email").notNull(),
  ip: text("ip"), userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_reveals_company").on(t.companyId, t.at)]);
```
- No update or delete routes for this table. The client's Record tab lists the last 10 reveals (who and when).
- The table goes in `tablesFilter` with the others.

### `contacts`

```ts
export const BILLING_ROLES = ["main", "cc", "none"] as const;
export const contacts_tb = pgTable("contacts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: bigint("company_id", { mode: "number" }).notNull(),
  name: text("name"), designation: text("designation"),
  emails: text("emails").array().notNull().default([]),   // lower-cased on write
  phones: text("phones").array().notNull().default([]),   // E.164 on write
  billingRole: text("billing_role").$type<(typeof BILLING_ROLES)[number]>().notNull().default("none"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_contacts_company").on(t.companyId),
  index("idx_contacts_emails").using("gin", t.emails),
  foreignKey({ name: "fk_contacts_company", columns: [t.companyId], foreignColumns: [companies_tb.id] }).onDelete("cascade"),
]);
```

### `probity_clients` (Probity Clients tab, its own list)

```ts
export const probity_clients_tb = pgTable("probity_clients", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyListed: text("company_listed").notNull(),        // [COMPANY] as typed in the tab
  companyId: bigint("company_id", { mode: "number" }),    // set by the cross-check; null = not in All Clients
  matchedBy: text("matched_by").$type<"email" | "name" | "manual">(),
  contactPerson: text("contact_person"),
  emails: text("emails").array().notNull().default([]),
  service: text("service"),                               // [Service], "Probity"
  agreementUrl: text("agreement_url"),                    // [Link of Signed Agreement]
  draftedOn: date("drafted_on", { mode: "string" }),      // [Date Drafted]
  referenceNo: text("reference_no"),                      // [Reference Number] e.g. "F2026 - 022"
  remarks: text("remarks"),                               // [Remarks/Status]
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [foreignKey({ name: "fk_probity_company", columns: [t.companyId], foreignColumns: [companies_tb.id] }).onDelete("set null")]);
```

### `suppliers` (OPS Supplier tab) and `dept_emails` (All Dept. Emails tab)

```ts
export const suppliers_tb = pgTable("suppliers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"),                 // [Supplier /Contractor]; can be blank in the sheet
  particulars: text("particulars"),   // [Particulars]
  contactName: text("contact_name"), emails: text("emails").array().notNull().default([]),
  phones: text("phones").array().notNull().default([]),   // split out of [Contact Details]
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const dept_emails_tb = pgTable("dept_emails", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  department: text("department").notNull(),   // section header rows: "ACCOUNTING DEPARTMENT", "LEGAL DEPARTMENT · CORPORATE TEAM", …
  name: text("name"), title: text("title"),
  emails: text("emails").array().notNull().default([]),   // [Email Address] + [Other email address]
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("idx_dept_emails_emails").using("gin", t.emails)]);
```

**Scraper table, read-only:** declare it in `src/db/external/candidates.ts`. That is outside `schema`, so push never emits DDL for it.
```ts
export const ext_candidates = pgTable("candidates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  emailKey: text("email_key").notNull(),
  fields: jsonb("fields").$type<CandidateFields>().notNull(),
  reviewed: jsonb("reviewed").$type<CandidateFields | null>(),
  reviewState: text("review_state").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  masterMatch: text("master_match").$type<"email" | "domain" | null>(),  // Scraper-owned tag, pending rows only
  masterIds: bigint("master_ids", { mode: "number" }).array(),           // companies.id[] the tag points at
});
```
`CandidateFields`: each key is `{ value, source, confidence }`. The keys are written by Scraper `backend/scraper/merge.py` `build_candidate`:

`name, emails, phones, company, stage, status, services, services_availed, department, payments, client_since, handlers, timeline{items,truncated}, engagement_paid, amounts, stage_dates, needs_check, first_contact, last_contact, sources`

Read `coalesce(reviewed, fields)`. Use only `review_state = 'approved'`.

Schema changes: `npm run db:push`, only with explicit human permission. Check renames by hand.

## 4. Derived links (read path)

**Gmail → client.** The approved candidate's emails come from `coalesce(reviewed, fields)->'emails'->'value'`.
```sql
WITH cand AS (
  SELECT c.id, coalesce(c.reviewed, c.fields) AS r,
         ARRAY(SELECT lower(jsonb_array_elements_text(coalesce(c.reviewed, c.fields)->'emails'->'value'))) AS emails
  FROM candidates c WHERE c.review_state = 'approved'
)
SELECT ct.company_id, cand.id AS candidate_id, cand.r
FROM contacts ct JOIN cand ON ct.emails && cand.emails;
```
- Run it once per list load, capped. Group in JS into a `Map<companyId, Candidate[]>`.
- Rollups are derived on read and never stored:
  - **Gmail stage:** the most advanced linked stage, `inquiry < quoted < invoiced < paid`.
  - **Last contact:** max `last_contact`. **Checks:** the concat of `needs_check`.
- **Engagement status comes from the sheet** (`companies.engagement` + `is_new`), not from Gmail. Gmail only adds stage, payments and the timeline.
- **Needs company** queue: approved candidates whose emails match no contact and no `dept_emails` address.
  - Suggest a client when the email domain (not free mail, same rule as the Scraper below) equals a domain already on that client's contacts.

**Master list → Scraper candidates** (runs in the Scraper; documented here so both sides match):
1. A pending candidate whose email is on any contact of a client: `master_match = 'email'`, `master_ids` = every such client.
2. Else, its email domain is on any client's contacts and is not free mail or internal: `'domain'`, `master_ids` = every client with that domain.
   - **Free mail:** the domain is in the Scraper's `merge.FREE_MAIL` list, or its first label is a free-mail provider (`yahoo, ymail, rocketmail, hotmail, outlook, live, msn, gmail, googlemail, aol, icloud, me, mac, proton, protonmail, gmx, mail, zoho, yandex`), so `yahoo.com.ph` and `hotmail.co.uk` never match. **Internal:** the Scraper's `INTERNAL_DOMAINS`.
3. Else no tag. Tags exist only while the candidate is pending; approve, reject and merge clear them, and reopening retags.
- **When it runs:** a full retag at the end of every Scraper scrape run (it reads the current `companies` + `contacts`), and an incremental retag for the candidates each extraction batch rebuilds. A directory import or contact edit is reflected at the next scrape run (the Scraper's schedule interval).
- Real-file baseline (2026-11-12, Scraper interim import): 1,492 clients and 1,601 unique emails tagged 986 pending candidates by email and 1,355 by domain, out of 10,701.

**Probity → client** (the cross-check). For each probity row, match in this order and store the first hit in `company_id` / `matched_by`:
1. Any probity email equals a contact email: `email`.
2. `name_key(company_listed)` equals the `name_key` of a client's registered name, alias or trade name: `name`.
3. Nothing matches: `company_id` stays null and the row shows **Not found** with **Add as client**, which prefills the new-client form.

Run the match on import, when a probity row is saved, and when a client's name or contacts change. The admin can also set it by hand (`manual`), and a manual match is never overwritten.

On the real file, 14 of 18 probity rows match by email or name. Expect about 4 "Not found" rows to review at cut-over.

## 5. API, services and pages

Routes (thin; every mutating route calls `requireSession()` + `requireRouteAccess("directory")`):

| Route | Does |
|---|---|
| `GET /api/companies` | List with rollups and probity tag (`{ items }`) |
| `POST /api/companies` | Create the client and its first contact in one transaction |
| `GET /api/companies/[id]` | Client, contacts, probity rows and merged Gmail activity |
| `PATCH /api/companies/[id]` | Edit client fields |
| `POST·PATCH·DELETE /api/companies/[id]/contacts[/contactId]` | Contacts; make main demotes the old main to cc in the same batch |
| `POST /api/companies/[id]/reveal-account` | Admin only. Logs to `sensitive_reveals`, then returns the decrypted number (`Cache-Control: no-store`) |
| `GET·POST·PATCH /api/probity[/id]` | Probity list and rows; save re-runs the match |
| `GET·POST·PATCH /api/suppliers[/id]` | Supplier list |
| `GET·POST·PATCH /api/dept-emails[/id]` | Internal mailboxes |
| `GET /api/needs-company` | Unlinked approved candidates and suggestions |
| `POST /api/needs-company/[candidateId]/attach` | Body `{ companyId }`: adds the candidate's emails as a `cc` contact |
| `POST /api/import/xlsx` | Preview (dry run) and commit; see section 6 |
| `GET /api/companies/export` | CSV in the sheet's column order, without `account_no` |

Services validate by hand. These are the same rules the mock enforces:
- **Registered name:** required, whitespace collapsed; unique on `name_key` → 409 "A client with this registered name already exists."
- **TIN:** optional, `^\d{3}-\d{3}-\d{3}-\d{3,5}$`. TIN + branch code is unique → 409. The sheet has the same TIN under different branches, and foreign entities have none.
- **Intercompany:** each value in `ENTITIES`. **Engagement:** in `ENGAGEMENTS` or null. **EFPS:** `eBIR | eFPS | VDS` or null.
- **Email:** lower-case, basic shape. One email belongs to **one client only** → 409 "This email already belongs to X". Emails in `dept_emails` are rejected as client contacts.
- **New client:** at least one contact email.
- **Phone:** `libphonenumber-js`, default region PH, store E.164. **GD link:** `https://` only.
- **Billing role:** in `BILLING_ROLES`; exactly one `main` per client.

Pages (`src/app/(app)/…`), following the mock.

Sidebar (pages only):
- Clients
- **Probity**: badge shows unmatched rows when there are any, else the total.
- Needs company: badge shows unlinked Gmail contacts.
- OPS suppliers
- Dept. emails

**`/clients`**, top to bottom: header → KPI row → filter panel → table. There is no chart band (removed 2026-11-12) and no separate status tabs.

- **Header:** Export CSV, Add client.
- **KPI row** (vault `kpi-card`), 4 cards in `grid-cols-2 md:grid-cols-4`. Each card is an uppercase tracked micro-label with a status dot, a large `tabular-nums` value, and a **required context line** whose colour is a semantic tone:
  - ACTIVE: `n% of clients`, good.
  - INACTIVE: `n% of clients`, muted.
  - NEW: `n already active`, muted.
  - NOT SET: "Status blank; backfill", warn (or "All set", good, when 0).
  - **The KPI cards are the engagement status filter.** Click to filter, click again to clear; keyboard works and they carry `aria-pressed`.
- **Filter panel:** one tonal panel (`--sunk`, no outline, `rounded-xl`) with two labelled layers, so the controls read as groups instead of a wall of buttons.
  - **Filter by:** four compact selects (`h-8`, filled with `--card`, no outline) whose placeholder is the field name: Intercompany, Acctg service, Supervisor, Gmail stage (inquiry, quoted, invoiced, paid, No Gmail). **Clear all** sits right-aligned on this line and shows only when a filter is on.
  - **Needs attention:** quiet ghost toggles (icon, label, count in a small pill) with no outline. The active one gets a 16% gold tint.
  - **Phone:** each label sits above its controls and the selects go two per row.

- **Table** (vault `data-table-card`): one table for the app.
  - **Header:** the title "Clients" in muted text, the count `12 of 12` in `text-primary tabular-nums`, and an `h-8` search on the right (registered name, alias, TIN, SEC no., contact, email; `/` focuses it).
  - **Columns:** `#` row number (from the page offset), Registered name (alias · main contact, **Probity** tag, needs-check icon), Engagement (+ NEW), Gmail stage, Acctg service, Intercompany, Last checked (gold when 90+ days or never), Last contact.
  - **Sorting:** one column at a time, with an ↕ / ↑ / ↓ icon and `aria-sort`; resets to page 1.
  - **Pager footer:** "Showing X to Y of N clients", Rows (10 / 25 / 50 / 100), Prev, `page / pages`, Next. The page is clamped when rows shrink. Any filter, search, chip, tab or sort resets to page 1.
  - **Empty:** "No clients match these filters." with a Clear filters button.
  - **Phone:** the table keeps only Registered name and Engagement; the sheet has the rest.
- **Needs attention chips:** one active at a time; they combine with the KPI status filter and the selects; a chip with 0 matches is disabled; kept in the URL as `?quick=`. All filter state (`status, ent, svc, sup, stage, quick, q, sort, page, size`) lives in the URL (vault `url-synced-list-filters`).
  - Needs check: Gmail `needs_check` not empty.
  - Recheck 90d+: `last_checked_billing` null or 90+ days ago.
  - Missing TIN.
  - Probity: matched to a probity row.
  - No Gmail yet.

**Client sheet tabs:**
- **Company:** the Probity block, when tagged (reference, drafted date, agreement link or "Missing", remarks; Open list), then the details in groups: Identity, Engagement, BIR & SEC, Billing check, Payroll / AP (only when filled; account masked, with a Reveal button that logs and re-masks after 30 s), Documents. An Edit button turns the groups into an inline form; Save or Cancel.
- **Contacts:** add, make main, remove; a "Seen in Gmail" or "From the sheet" tag.
- **Activity:** read-only Gmail: stage steps, quotes and invoices, payments, timeline, needs-check alerts.
- **Record:** ids, the probity rows matched (and by what) and the linked candidate ids.

**Other pages:**
- **`/probity`:** columns are Company (as listed), In All Clients (✓ + client name, or **Not found** + Add as client), Contact, Reference, Drafted, Agreement (link or **Missing**), Remarks / status. A matched row opens the client.
- **`/needs-company`:** the queue, with "Attach to…" (suggested client preselected), Attach, and New client.
- **`/suppliers`:** Supplier / contractor, Particulars, Contact, Email.
- **`/dept-emails`:** one table grouped by department rows: Name, Title, Email addresses.

## 6. Excel import (one-time, then retire the Excel)

Use the starter kit's `xlsx-import-dialog` with the `xlsx` package. The admin uploads the file, sees a **preview** per tab, then commits in one transaction.

This is the **only** master-list upload. The commit writes `companies` + `contacts`, which the Scraper reads for its tags, so there is nothing to upload to the Scraper. The Scraper's interim import (`POST /api/master/import`, `python -m scraper.master import`, tables `master_clients` / `master_imports`) exists only until this import ships and is retired at cut-over (section 7).

The preview shows:
- Rows and clients.
- Merged spellings.
- Emails under two clients.
- Rows without email.
- Probity matched vs not found.

Tabs are matched by name ignoring spacing and case. The real main tab is `All Clients  Database`, with **two spaces**. Columns are found by header text, not position; many headers carry a second line (for example `DATE LAST CHECKED\n(BILLING)`), so match on the first line plus the bracket part. Only these four tabs are read: **All Clients Database**, **Probity Clients**, **OPS Supplier**, **All Dept. Emails**.

**All Clients Database:** one row per client (about 1,492 rows with a registered name).
- **Contacts are packed** in one cell, separated by ` / ` or newlines. Split `CONTACT PERSON/DESIGNATION`, `CONTACT NO.`, `EMAIL ADDRESS` and `BILLING` the same way and zip them by position. For example, `Main / cc / cc` gives the first email `main` and the others `cc`.
  - When the counts differ, extract all emails with a regex. Give the first one `main` and the rest `cc`, and list the row in the preview as "check contacts".
- `INTERCOMPANY`: split on `,` → `entities[]`, upper-cased; `N/A` → empty.
- `ENGAGEMENT STATUS`: `ACTIVE`, `INACTIVE`, `NEW, ACTIVE`, `ACTIVE, NEW`, `NEW`, … gives `is_new` = the value contains NEW, and `engagement` = ACTIVE or INACTIVE if present, else null. About 747 rows are blank and become "Not set".
- `NON-INDIVIDUAL` / `INDIVIDUAL`: a value in either column sets `type`; most rows have neither and default to Non-individual.
- **Dates** arrive as Excel serial numbers (`45994.46`) or text (`08/14/2020`); convert both to `YYYY-MM-DD`.
- **Codes keep their leading zeros** (`RDO 050`, branch `00000`, zip): read them as text, never as numbers.
- Treat `N/A`, `NA`, `-`, `TBD`, `#REF!` and blanks as null.

**Probity Clients:**
- One row per probity engagement. Rows with only a repeated company name and no other cells are skipped.
- `Email Address` may hold several emails on separate lines. They have typos in the source (for example, a space inside the address); the preview flags any email that fails the shape check.
- Then run the cross-check from section 4.

**OPS Supplier:** a header row, then rows. `Contact Details` mixes name and `Email Add: …`; split them with the email regex.

**All Dept. Emails:**
- Section-title rows (a value only in column B or C, such as `ACCOUNTING DEPARTMENT` or `CORPORATE TEAM`) set the current department.
- Numbered rows are people. Rows with only an email in `Other email address` are shared mailboxes.

Cleaning rules:
- `name_key`: lower-case, drop `(…)` and punctuation, and strip `inc, corp, corporation, pte, ltd, limited, llc, co, company, opc, pty, plc, gmbh` and a leading `the`. Same-key rows in the main tab are listed in the preview, not silently merged; the sheet has a real case of one client with a local and a foreign entity under different names.
- **Idempotent:** upsert clients on `name_key` and only fill empty fields, so admin edits made later win. Skip contacts whose email already exists on that client.
- **Tests** (vitest, `tests/import/*.test.ts`): packed-contact zipping, `NEW, ACTIVE` parsing, Excel serial dates, leading-zero codes, the probity match order, dept section rows and an email listed under two clients.

## 7. Cut-over

1. Push the schema with permission, then import with preview, then commit.
   - **Scraper switch, same release window** (a backend change made in the Scraper repo): its retag reads `companies` + `contacts` in place of `master_clients`, `master_ids` point at `companies.id`, a full retag runs at the end of every scrape run (today it runs only after the interim import), then drop `master_clients` / `master_imports`, the interim import route and CLI, and the `masterlist` role grant.
   - Then turn the Scraper's match UI on: `NEXT_PUBLIC_MASTER_MATCH=1` in the Scraper frontend env, rebuild. Until then its Review page hides the tags.
   - Check: the Scraper's pending tag counts are close to the baseline in section 4 (they move as new mail is scraped).
2. Spot-check 10 clients against the sheet, including one with packed Main + cc contacts and one with two intercompany entities.
3. Resolve every probity row marked "Not found".
4. Work the Needs company queue down to zero.
5. Export CSV, compare it with the sheet once, then accounting stops editing the Excel.

## 8. Open questions

- About 747 clients have no engagement status. Should accounting backfill them, or should Gmail activity suggest a value?
- Are `PROPOSE CHANGES` / `MA'AM GHEL APPROVAL` an approval step the app must keep (changes waiting for a named approver)? The mock assumes direct edits.
- Should non-admin roles see the directory read-only? The mock assumes the admin role only.
- Should a directory import or contact edit retag Scraper candidates immediately (a trigger or a call to the Scraper)? Today it waits for the next scrape run.
