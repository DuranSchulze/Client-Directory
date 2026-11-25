# Client Directory

Admin directory that replaces the accounting Excel (`Clients Database.xlsx`). It owns the master list (`companies` + `contacts`) that the Scraper reads from the same Postgres database to tag Gmail candidates. Build spec: [BUILD.md](BUILD.md). Visual reference: [mock/client-directory.html](mock/client-directory.html).

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn `base-nova`, TanStack Query, Drizzle ORM, and node-postgres.

## Setup

The Scraper Docker stack runs Postgres 18 and publishes it at `127.0.0.1:5434`. Use `client_directory` for the app and a separate `client_directory_test` database with the same schema for tests.

```bash
docker compose -f ../Scraper/docker-compose.yml up -d db
npm install
cp .env.example .env    # then fill in the values
npm run db:seed         # creates the Owner admin from DIRECTORY_ADMIN_EMAIL / DIRECTORY_ADMIN_PASSWORD when no user exists
npm run dev             # http://127.0.0.1:3100
```

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Host connection to `127.0.0.1:5434/client_directory` for development and scripts. |
| `CONTAINER_DATABASE_URL` | Connection to `host.docker.internal:5434/client_directory` for the Compose web container. |
| `TEST_DATABASE_URL` | Host connection to the separate `127.0.0.1:5434/client_directory_test` database. |
| `SESSION_SECRET` | 32+ random characters. Not the Scraper's `JWT_SECRET`; the two logins are separate. |
| `ACCOUNT_NO_KEY` | 32 random bytes, base64. Encrypts bank account numbers (AES-256-GCM). Rotating it means re-encrypting. |
| `DIRECTORY_ADMIN_EMAIL`, `DIRECTORY_ADMIN_PASSWORD` | The seeded admin. |

## Schema changes

`npm run db:push` is a **dry run**: it exports the declared schema, validates the entire SQL batch, reads the live catalog and prints missing directory objects without writing. `npm run db:apply` applies that plan on one connection in one transaction; an error rolls it back. Both commands read `DATABASE_URL` from `.env`.

The tool only bootstraps missing tables, indexes and constraints for the 10 directory tables in `public`. It rejects unsupported SQL and references to other tables or schemas before any write. The table allowlist is shared with `drizzle.config.ts`. Existing objects are matched by kind and owning table; existing tables must have the declared column names, types and nullability. Column drift fails with a request for a reviewed manual migration: the sole additive migration is nullable `contacts.source`; otherwise this tool does not migrate existing objects or reconcile index/constraint definitions.

1. Set `DATABASE_URL` to the `TEST_DATABASE_URL` value for the schema CLI, inspect `npm run db:push`, then run `npm run db:apply` there.
2. Restore the app database URL and run `npm run test:int` with `TEST_DATABASE_URL` set.
3. Back up the shared database and inspect its dry run before applying.

Never invoke `drizzle-kit push` directly on the shared database: its table filter does not protect Scraper sequences from proposed drops. The bootstrap accepts foreign-key `ON DELETE CASCADE` between directory tables; destructive `DROP ... CASCADE` is refused.

## Accounts and grants

Roles grant `directory` (the five directory pages, counts and bank-number reveal), `import` (Excel import), or `accounts` (account and role management). The locked Owner role always grants all three. Login and `/api/auth/me` return `{ id, email, name, role: { id, name }, routes }`; active accounts may have no grants. Logout always clears the session, including a missing or revoked session. Account writes lock roles then users and recheck the actor after the lock, so a waiting request cannot use revoked access.

For a fresh database, inspect `npm run db:push`, bootstrap with `npm run db:apply`, then run `npm run db:seed`. The seed is silent and does nothing if any directory user exists. It creates the locked Owner role as needed and assigns the seeded admin to it.

For **every existing directory database**, run this once before deploying the new backend and frontend:

```bash
npm run db:migrate-roles              # dry run; catalog reads only
npm run db:migrate-roles -- --apply   # creates directory_roles, assigns legacy users to Owner, replaces role with role_id
npm run db:migrate-roles -- --apply   # must report 0 statements; later role assignments are preserved
```

The migration touches only `directory_roles` and `directory_users`, on one connection in one transaction; an error rolls it back and closes the pool. `db:push` is a bootstrap and refuses the legacy column drift, so it cannot replace this migration. Neither the migration nor the bootstrap touches the Scraper's `users` or `roles` tables.

Run the migration on `client_directory_test` first, then restore the app database URL and run `npm run test:int`. Confirm the account race and legacy migration tests ran. Back up the app database before applying the migration there, then smoke-test login and Accounts.

## Import

Clients page, **Import Excel**: upload the workbook, review the preview (counts per table, merged spellings, emails under two clients, invalid emails, rows without email, Probity matched vs not found), then **Save import**. Re-importing only fills empty fields, so later edits in the app win. Only the four tabs are read: All Clients Database, Probity Clients, OPS Supplier, All Dept. Emails. The Scraper sees new contacts at its next scrape run.

## Checks

```bash
npm run typecheck
npm run lint
npm test               # unit + import parser tests (synthetic workbooks, no real data)
npm run test:int       # against TEST_DATABASE_URL only
npm run build
npx tsx --conditions=react-server scripts/smoke-db.ts
```

The smoke script checks the restored app database for 2,035 Scraper clients and reads the Directory companies table. It then verifies commit and rollback on `client_directory_test` and removes its test rows.

## Deploy

**Docker:**

```bash
docker compose build
docker compose up -d   # http://127.0.0.1:3100, reads .env at runtime
```

The image is a Next standalone build (`BUILD_STANDALONE=1`) on `node:22-alpine`. Compose sets the web container's `DATABASE_URL` from `CONTAINER_DATABASE_URL`. Secrets are read at runtime. Behind Docker, put a reverse proxy in front that sets `X-Forwarded-For`, since the login rate limit keys on it.

## Automatic contact distribution

Automatic writes are off by default. After verifying the schema and integration tests on the dev DB, enable `AUTO_DISTRIBUTE=1`. Pending and approved Scraper candidates can become `cc` contacts when their valid corporate domains identify exactly one client using manual/import contacts. Free-mail domains and `INTERNAL_DOMAINS` (a comma-separated list) are excluded. Auto-added contacts never seed new matches. Scraper tables remain read-only.

Docker runs distribution after each committed workbook upload and every `DISTRIBUTE_EVERY_MINUTES` (default 15, minimum 5). No timer runs in builds or tests. Both triggers use a nonblocking advisory lock; overlapping runs skip, while writes serialize with import and manual attachment under the email ownership lock. A failed after-upload run is logged without failing the committed import.

A later workbook may move an email from an auto-added contact to its workbook client or department mailbox. Preview `moves` lists `{ email, fromCompanyId, toCompanyId }` (null for a department; temporary negative client IDs identify new clients in preview); `changes.contacts.updated` counts affected source contacts, including those deleted when emptied. Manual/import-owned conflicts retain their existing behavior. Deleting an auto-added contact suppresses its emails from future automatic runs; manual Needs company attachment remains available. Contacts expose `source: "scraper"` for auto-added rows, otherwise null; CSV columns stay the same.
