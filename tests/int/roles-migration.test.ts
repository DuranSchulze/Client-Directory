import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.TEST_DATABASE_URL)("legacy directory roles migration", () => {
  it("assigns Owner, enforces the FK, and preserves a later non-Owner assignment on rerun", async () => {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { default: ws } = await import("ws");
    const { applyRoleMigration } = await import("../../scripts/migrate-roles");
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Move existing test tables aside within this rollback-only transaction; other suites run sequentially.
        const backup = `roles_test_${randomUUID().replaceAll("-", "")}`;
        await client.query(`CREATE SCHEMA "${backup}"`);
        await client.query(`ALTER TABLE public.directory_users SET SCHEMA "${backup}"`);
        await client.query(`ALTER TABLE public.directory_roles SET SCHEMA "${backup}"`);
        await client.query("CREATE TABLE public.directory_users (id bigserial PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'admin', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())");
        const { rows: [legacy] } = await client.query("INSERT INTO public.directory_users(email, name, password_hash) VALUES ('legacy@example.test', 'Legacy', 'not-a-login') RETURNING id");
        expect((await applyRoleMigration(client)).length).toBeGreaterThan(0);
        const { rows: [user] } = await client.query("SELECT u.role_id, r.name, r.locked, r.routes FROM public.directory_users u JOIN public.directory_roles r ON r.id = u.role_id WHERE u.id = $1", [legacy.id]);
        expect(user).toMatchObject({ name: "Owner", locked: true, routes: ["directory", "import", "accounts"] });
        const columns = await client.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='directory_users'");
        expect(columns.rows).toContainEqual({ column_name: "role_id", is_nullable: "NO" });
        expect(columns.rows.some((c) => c.column_name === "role")).toBe(false);
        await client.query("SAVEPOINT invalid_role");
        await expect(client.query("UPDATE public.directory_users SET role_id = -1 WHERE id = $1", [legacy.id])).rejects.toMatchObject({ code: "23503" });
        await client.query("ROLLBACK TO SAVEPOINT invalid_role");
        const { rows: [limited] } = await client.query("INSERT INTO public.directory_roles(name, routes) VALUES ('Limited', ARRAY['import']) RETURNING id");
        await client.query("UPDATE public.directory_users SET role_id = $1 WHERE id = $2", [limited.id, legacy.id]);
        expect(await applyRoleMigration(client)).toEqual([]);
        expect((await client.query("SELECT role_id FROM public.directory_users WHERE id = $1", [legacy.id])).rows[0].role_id).toBe(limited.id);
      } finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
    } finally { await pool.end(); }
  }, 60000);
});
