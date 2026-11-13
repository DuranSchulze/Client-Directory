import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { ROUTES } from "../src/lib/routes";

export type MigrationState = { roles: boolean; owner: boolean; legacyRole: boolean; roleId: boolean; roleIdNotNull: boolean; foreignKey: boolean };
const createRoles = `CREATE TABLE public.directory_roles (id bigserial PRIMARY KEY NOT NULL, name text NOT NULL, routes text[] NOT NULL, locked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_directory_roles_name UNIQUE (name))`;
const ownerId = `(SELECT id FROM public.directory_roles WHERE name = 'Owner' AND locked = true)`;
export function planMigration(state: MigrationState): string[] {
  const plan: string[] = [];
  if (!state.roles) plan.push(createRoles);
  if (!state.owner) plan.push(`INSERT INTO public.directory_roles (name, routes, locked) VALUES ('Owner', ARRAY[${ROUTES.map((r) => `'${r}'`).join(", ")}], true)`);
  if (!state.roleId) plan.push("ALTER TABLE public.directory_users ADD COLUMN role_id bigint");
  if (state.legacyRole || !state.roleId) plan.push(`UPDATE public.directory_users SET role_id = ${ownerId}`);
  else if (!state.roleIdNotNull) plan.push(`UPDATE public.directory_users SET role_id = ${ownerId} WHERE role_id IS NULL`);
  if (!state.roleId || !state.roleIdNotNull) plan.push("ALTER TABLE public.directory_users ALTER COLUMN role_id SET NOT NULL");
  if (!state.foreignKey) plan.push("ALTER TABLE public.directory_users ADD CONSTRAINT fk_directory_users_role FOREIGN KEY (role_id) REFERENCES public.directory_roles(id)");
  if (state.legacyRole) plan.push("ALTER TABLE public.directory_users DROP COLUMN role");
  return plan;
}
async function readState(client: PoolClient): Promise<MigrationState> {
  const { rows: [tables] } = await client.query<{ roles: boolean; users: boolean }>("SELECT to_regclass('public.directory_roles') IS NOT NULL AS roles, to_regclass('public.directory_users') IS NOT NULL AS users");
  if (!tables.users) throw new Error("Bootstrap directory_users before migrating roles");
  const { rows: columns } = await client.query<{ column_name: string; is_nullable: string }>("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'directory_users'");
  const { rows: [fk] } = await client.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'fk_directory_users_role' AND conrelid = to_regclass('public.directory_users') AND confrelid = to_regclass('public.directory_roles')) AS present");
  const owner = tables.roles ? (await client.query<{ locked: boolean; routes: string[] }>("SELECT locked, routes FROM public.directory_roles WHERE name = 'Owner'")).rows[0] : undefined;
  if (owner && (!owner.locked || ROUTES.some((r) => !owner.routes.includes(r)))) throw new Error("Existing Owner role is incompatible; review it before migrating");
  return { roles: tables.roles, owner: !!owner, legacyRole: columns.some((c) => c.column_name === "role"), roleId: columns.some((c) => c.column_name === "role_id"), roleIdNotNull: columns.some((c) => c.column_name === "role_id" && c.is_nullable === "NO"), foreignKey: fk.present };
}
// Caller owns the transaction; also used by the rollback-isolated legacy-schema integration test.
export async function applyRoleMigration(client: PoolClient): Promise<string[]> {
  const state = await readState(client), initial = planMigration(state);
  if (!initial.length) return [];
  const applied: string[] = [];
  if (!state.roles) { await client.query(createRoles); applied.push(createRoles); }
  await client.query("LOCK TABLE public.directory_roles, public.directory_users IN SHARE ROW EXCLUSIVE MODE");
  const plan = planMigration(await readState(client));
  for (const statement of plan) { await client.query(statement); applied.push(statement); }
  return applied;
}
export async function run(args = process.argv.slice(2)): Promise<number> {
  if (args.length > 1 || args.some((arg) => arg !== "--apply")) { console.error("Usage: migrate-roles.ts [--apply]"); return 1; }
  if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL to inspect the roles migration"); return 1; }
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    let begun = false;
    try {
      let plan: string[];
      if (args.includes("--apply")) {
        await client.query("BEGIN"); begun = true;
        plan = await applyRoleMigration(client);
        await client.query("COMMIT"); begun = false;
      } else plan = planMigration(await readState(client));
      console.log(`${args.includes("--apply") ? "Applied" : "Dry run"}: ${plan.length} statements.`);
      for (const statement of plan) console.log(statement + ";");
      if (!args.includes("--apply")) console.log("No writes. Add --apply to apply the roles migration.");
    } catch (error) {
      if (begun) await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
    return 0;
  } catch {
    console.error("Roles migration failed; check database access and the directory schema. Any open transaction was rolled back.");
    return 1;
  } finally { await pool.end(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void run().then((code) => { process.exitCode = code; });
