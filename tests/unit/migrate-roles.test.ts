import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn(), end: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neonConfig: {}, Pool: class { connect = m.connect; end = m.end; } }));
import { planMigration, run, type MigrationState } from "../../scripts/migrate-roles";
let state: MigrationState;
const migrated: MigrationState = { roles: true, owner: true, legacyRole: false, roleId: true, roleIdNotNull: true, foreignKey: true };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://unused.invalid/test");
  state = { roles: false, owner: false, legacyRole: true, roleId: false, roleIdNotNull: false, foreignKey: false };
  m.connect.mockResolvedValue({ query: m.query, release: m.release });
  m.end.mockResolvedValue(undefined);
  m.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT to_regclass")) return { rows: [{ roles: state.roles, users: true }] };
    if (sql.includes("information_schema.columns")) return { rows: [...(state.legacyRole ? [{ column_name: "role", is_nullable: "NO" }] : []), ...(state.roleId ? [{ column_name: "role_id", is_nullable: state.roleIdNotNull ? "NO" : "YES" }] : [])] };
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ present: state.foreignKey }] };
    if (sql.startsWith("SELECT locked")) return { rows: state.owner ? [{ locked: true, routes: ["directory", "import", "accounts"] }] : [] };
    if (sql.startsWith("CREATE TABLE")) state.roles = true;
    if (sql.startsWith("INSERT INTO")) state.owner = true;
    if (sql.includes("ADD COLUMN role_id")) state.roleId = true;
    if (sql.includes("SET NOT NULL")) state.roleIdNotNull = true;
    if (sql.includes("ADD CONSTRAINT")) state.foreignKey = true;
    if (sql.includes("DROP COLUMN role")) state.legacyRole = false;
    return { rows: [] };
  });
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("plans the legacy upgrade in order, with Owner assignment and a non-cascading FK", () => {
  const plan = planMigration(state);
  expect(plan).toHaveLength(7);
  expect(plan[0]).toMatch(/^CREATE TABLE public.directory_roles/);
  expect(plan[1]).toContain("ARRAY['directory', 'import', 'accounts']");
  expect(plan[2]).toContain("ADD COLUMN role_id bigint");
  expect(plan[3]).toMatch(/^UPDATE public.directory_users SET role_id/);
  expect(plan[4]).toContain("SET NOT NULL");
  expect(plan[5]).toContain("REFERENCES public.directory_roles(id)");
  expect(plan[5]).not.toContain("CASCADE"); expect(plan[6]).toContain("DROP COLUMN role");
  expect(planMigration(migrated)).toEqual([]);
});
it("dry run prints the plan and executes catalog reads only", async () => {
  expect(await run([])).toBe(0);
  expect(m.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  expect(console.log).toHaveBeenCalledWith("Dry run: 7 statements.");
  expect(m.release).toHaveBeenCalledTimes(1); expect(m.end).toHaveBeenCalledTimes(1);
});
it("applies on one checked-out connection, then leaves later assignments untouched on the second run", async () => {
  expect(await run(["--apply"])).toBe(0);
  const queries = m.query.mock.calls.map(([sql]) => sql);
  expect(queries[0]).toBe("BEGIN"); expect(queries.at(-1)).toBe("COMMIT");
  expect(queries).toContain("LOCK TABLE public.directory_roles, public.directory_users IN SHARE ROW EXCLUSIVE MODE");
  expect(state).toEqual(migrated);
  expect(m.connect).toHaveBeenCalledTimes(1); expect(m.release).toHaveBeenCalledTimes(1); expect(m.end).toHaveBeenCalledTimes(1);
  m.query.mockClear();
  expect(await run(["--apply"])).toBe(0);
  expect(m.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|CREATE|ALTER)/.test(sql))).toBe(false);
  expect(console.log).toHaveBeenCalledWith("Applied: 0 statements.");
});
it("fills only null assignments when recovering a partially added role_id without a legacy column", () => {
  expect(planMigration({ ...migrated, roleIdNotNull: false })[0]).toContain("WHERE role_id IS NULL");
});
it("rolls back a failed statement and never drops the old column or commits; always releases and closes", async () => {
  const query = m.query.getMockImplementation()!;
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes("ADD CONSTRAINT")) throw new Error("injected FK failure");
    return query(sql);
  });
  expect(await run(["--apply"])).toBe(1);
  const statements = m.query.mock.calls.map(([sql]) => sql);
  expect(statements.at(-1)).toBe("ROLLBACK"); expect(statements).not.toContain("COMMIT");
  expect(statements.some((sql) => sql.includes("DROP COLUMN"))).toBe(false);
  expect(m.release).toHaveBeenCalledTimes(1); expect(m.end).toHaveBeenCalledTimes(1);
});
it("closes the pool when connect fails, and rejects bad CLI arguments without connecting", async () => {
  m.connect.mockRejectedValueOnce(new Error("cannot connect"));
  expect(await run([])).toBe(1); expect(m.end).toHaveBeenCalledTimes(1);
  expect(await run(["--bad"])).toBe(1); expect(m.connect).toHaveBeenCalledTimes(1);
});
