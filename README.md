# Client Directory

Admin directory that replaces the accounting Excel (`Clients Database.xlsx`). It owns the master list (`companies` + `contacts`) that the Scraper reads from the same Neon database to tag Gmail candidates. Build spec: [BUILD.md](BUILD.md). Visual reference: [mock/client-directory.html](mock/client-directory.html).

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn `base-nova`, TanStack Query, Drizzle ORM on Neon Postgres (`neon-http`, plus a WebSocket pool for transactions).

## Setup

```bash
npm install
cp .env.example .env    # then fill in the values
npm run db:seed         # creates the Owner admin from DIRECTORY_ADMIN_EMAIL / DIRECTORY_ADMIN_PASSWORD when no user exists
npm run dev             # http://127.0.0.1:3100
```

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon connection string. The same database as the Scraper. |
| `TEST_DATABASE_URL` | A disposable Neon branch for `npm run test:int`. Must differ from `DATABASE_URL`. |
| `SESSION_SECRET` | 32+ random characters. Not the Scraper's `JWT_SECRET`; the two logins are separate. |
| `ACCOUNT_NO_KEY` | 32 random bytes, base64. Encrypts bank account numbers (AES-256-GCM). Rotating it means re-encrypting. |
| `DIRECTORY_ADMIN_EMAIL`, `DIRECTORY_ADMIN_PASSWORD` | The seeded admin. |

## Schema changes

`npm run db:push` is a **dry run**: it exports the declared schema, validates the entire SQL batch, reads the live catalog and prints missing directory objects without writing. `npm run db:apply` applies that plan on one connection in one transaction; an error rolls it back. Both commands read `DATABASE_URL` from `.env`.

The tool only bootstraps missing tables, indexes and constraints for the 8 directory tables in `public`. It rejects unsupported SQL and references to other tables or schemas before any write. The table allowlist is shared with `drizzle.config.ts`. Existing objects are matched by kind and owning table; existing tables must have the declared column names, types and nullability. Column drift fails with a request for a reviewed manual migration: this tool does not migrate existing objects or reconcile index/constraint definitions.

1. Point `DATABASE_URL` at a disposable Neon branch, inspect `npm run db:push`, then run `npm run db:apply` there.
2. Restore the intended `DATABASE_URL`, set `TEST_DATABASE_URL` to the disposable branch (different from `DATABASE_URL`), and run `npm run test:int`.
3. Take a restore-point branch, inspect the shared database dry run again, then apply.

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

Run the migration on the disposable `directory-test` branch first, then `npm run test:int` with that branch's `TEST_DATABASE_URL` different from `DATABASE_URL`. Confirm the accounts races and legacy migration test executed, not skipped. Integration tests temporarily isolate directory fixtures and must never target production. Nothing is deployed yet; after frontend review and user approval, take a Neon restore branch, inspect/apply the production migration, deploy the matching backend/frontend, and smoke-test login and Accounts. Recover from a committed migration by restoring that branch.

## Import

Clients page, **Import Excel**: upload the workbook, review the preview (counts per table, merged spellings, emails under two clients, invalid emails, rows without email, Probity matched vs not found), then **Save import**. Re-importing only fills empty fields, so later edits in the app win. Only the four tabs are read: All Clients Database, Probity Clients, OPS Supplier, All Dept. Emails. The Scraper sees new contacts at its next scrape run.

## Checks

```bash
npm run typecheck
npm run lint
npm test               # unit + import parser tests (synthetic workbooks, no real data)
npm run test:int       # against TEST_DATABASE_URL only
npm run build
```

## Deploy

**Vercel (staging):** import the repo, keep the default build, set the five variables above in the project settings (not `TEST_DATABASE_URL`), deploy. No `vercel.json` is needed.

**Docker:**

```bash
docker compose build
docker compose up -d   # http://127.0.0.1:3100, reads .env at runtime
```

The image is a Next standalone build (`BUILD_STANDALONE=1`) on `node:22-alpine`. Secrets are read at runtime only, never baked into the image. Behind Docker, put a reverse proxy in front that sets `X-Forwarded-For`, since the login rate limit keys on it.
