import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIRECTORY_TABLES } from "@/db/directory-tables";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const mocks = vi.hoisted(() => ({ export: vi.fn(), query: vi.fn(), connect: vi.fn(), release: vi.fn(), end: vi.fn(), pool: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: mocks.export }));
vi.mock("@neondatabase/serverless", () => ({
  neonConfig: {},
  Pool: class {
    constructor(options: unknown) { mocks.pool(options); }
    connect = mocks.connect;
    end = mocks.end;
  },
}));
import { parseStatements, validateBatch, planApply, run, type LiveCatalog } from "../../scripts/db-apply";

const table = `CREATE TABLE "companies" ("id" bigserial PRIMARY KEY NOT NULL, "name" text NOT NULL, "entities" text[] DEFAULT '{}' NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL);`;
const index = `CREATE UNIQUE INDEX "uq_companies_name" ON "companies" USING btree ("name");`;
const constraint = `ALTER TABLE "contacts" ADD CONSTRAINT "fk_contacts_company" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;`;
const empty: LiveCatalog = { tables: [], indexes: [], constraints: [] };
const batch = (sql: string) => parseStatements(sql);
const columns = validateBatch(batch(table))[0].columns;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://unused.invalid/directory");
  mocks.export.mockReturnValue(table + index + constraint);
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.end.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("closed SQL grammar", () => {
  it("accepts the installed Drizzle export of the actual seven-table schema without database access", async () => {
    const { execFileSync } = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const require = createRequire(import.meta.url);
    const sql = execFileSync(process.execPath, [resolve(dirname(require.resolve("drizzle-kit")), "bin.cjs"), "export"], { encoding: "utf8" });
    const declarations = validateBatch(batch(sql));
    expect(declarations.filter((d) => d.kind === "table").map((d) => d.table).sort()).toEqual([...DIRECTORY_TABLES].sort());
    expect(declarations.some((d) => d.kind === "index")).toBe(true);
    expect(declarations.some((d) => d.kind === "constraint")).toBe(true);
  });
  it("parses quoted semicolons, escaped quotes and nested/line comments without splitting string data", () => {
    const sql = `-- heading;\nCREATE TABLE "suppliers" ("name" text DEFAULT 'a; b''s'); /* outer /* inner; */ end */`;
    expect(validateBatch(batch(sql))).toMatchObject([{ kind: "table", table: "suppliers" }]);
    expect(batch(sql)).toHaveLength(1);
  });

  it("accepts every directory table and the exported index and FK forms, qualifying relations and now", () => {
    const sql = DIRECTORY_TABLES.map((name) => `CREATE TABLE public.${name} (id bigserial PRIMARY KEY NOT NULL);`).join("\n")
      + table.replace('"companies"', '"public"."companies"') + index + constraint
      + `CREATE UNIQUE INDEX uq_tin ON companies USING btree (tin, coalesce(branch_code, '')) WHERE companies.tin IS NOT NULL;`
      + `CREATE UNIQUE INDEX uq_main ON contacts (company_id) WHERE contacts.billing_role = 'main';`
      + `CREATE INDEX idx_emails ON contacts USING gin (emails);`
      + `ALTER TABLE companies ADD CONSTRAINT uq_name UNIQUE (name);`;
    const parsed = validateBatch(batch(sql));
    expect(parsed).toHaveLength(14);
    expect(parsed.find((item) => item.columns.length === 4)?.sql).toContain('"public"."companies"');
    expect(parsed.find((item) => item.columns.length === 4)?.sql).toContain("pg_catalog.now ( )");
    expect(columns).toEqual([
      { name: "id", type: "bigint", nullable: false }, { name: "name", type: "text", nullable: false },
      { name: "entities", type: "text[]", nullable: false }, { name: "created_at", type: "timestamp with time zone", nullable: false },
    ]);
  });

  it.each([
    "DROP SEQUENCE users_id_seq;", "DROP TABLE companies CASCADE;", "TRUNCATE companies;", "DELETE FROM companies;",
    "ALTER TABLE users ADD CONSTRAINT x UNIQUE (id);", "ALTER TABLE companies ADD COLUMN x text;",
    "ALTER TABLE contacts ADD CONSTRAINT x FOREIGN KEY (company_id) REFERENCES users(id);",
    "ALTER TABLE contacts ADD CONSTRAINT x FOREIGN KEY (company_id) REFERENCES other.companies(id);",
    "CREATE TABLE other.companies (id bigint);", "CREATE INDEX x ON other.companies (id);",
    "CREATE INDEX x ON users (id);", "CREATE INDEX x ON companies (users.id);",
    "CREATE TABLE companies (id bigint DEFAULT nextval('users_id_seq'));",
    "CREATE TABLE companies (id bigint REFERENCES users(id));",
    "CREATE TABLE companies AS SELECT * FROM users;", "CREATE TABLE companies (name text) INHERITS (users);",
    "CREATE INDEX x ON companies (dangerous(name));", "CREATE INDEX x ON companies (name) WHERE dangerous(name);",
    "ALTER TABLE contacts ADD CONSTRAINT x CHECK (dangerous(company_id));",
    "CREATE TABLE companies (id bigint); COMMIT;", "CREATE TABLE companies (id bigint) CASCADE;",
    "CREATE TABLE companies (id bigint); unparseable text", "DO $$ BEGIN DELETE FROM users; END $$;",
    'CREATE TABLE "companies; DROP TABLE users" (id bigint);', "CREATE TABLE companies (name text DEFAULT E'x');",
    "CREATE TABLE companies (name text DEFAULT 'unterminated);", "/* unterminated", "",
  ])("rejects the entire mixed batch: %s", (bad) => {
    if (!bad) expect(() => validateBatch([])).toThrow(/empty/i);
    else expect(() => validateBatch(batch(table + bad))).toThrow(/Refused/);
  });
});

describe("bootstrap planning", () => {
  it("skips existing tables, indexes and constraints only by their own kind and owner", () => {
    expect(planApply(batch(table + index + constraint), {
      tables: [{ name: "companies", columns: [...columns].reverse() }],
      indexes: [{ name: "uq_companies_name", table: "companies" }],
      constraints: [{ name: "fk_contacts_company", table: "contacts" }],
    })).toEqual([]);
    expect(planApply(batch(index + constraint), {
      tables: [{ name: "uq_companies_name", columns: [] }],
      indexes: [{ name: "uq_companies_name", table: "users" }, { name: "fk_contacts_company", table: "contacts" }],
      constraints: [{ name: "fk_contacts_company", table: "companies" }],
    })).toHaveLength(2);
  });
  it.each(["missing", "extra", "type", "nullable"])("fails on %s columns with manual migration guidance", (change) => {
    const drifted = structuredClone(columns);
    if (change === "missing") drifted.pop();
    if (change === "extra") drifted.push({ name: "extra", type: "text", nullable: true });
    if (change === "type") drifted[0].type = "text";
    if (change === "nullable") drifted[0].nullable = true;
    expect(() => planApply(batch(index + table), { ...empty, tables: [{ name: "companies", columns: drifted }] })).toThrow(/reviewed manual migration/);
  });
});

describe("runner (no database)", () => {
  it("dry run performs only catalog reads, on one released connection, and closes the pool", async () => {
    expect(await run([])).toBe(0);
    expect(mocks.export).toHaveBeenCalledWith(process.execPath, [expect.stringMatching(/bin\.cjs$/), "export"], expect.any(Object));
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.query.mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
  it.each(["DROP SEQUENCE users_id_seq;", "ALTER TABLE contacts ADD CONSTRAINT x FOREIGN KEY (company_id) REFERENCES users(id);"])("validates all SQL before connecting or BEGIN: %s", async (bad) => {
    mocks.export.mockReturnValue(table + bad);
    expect(await run(["--apply"])).toBe(1);
    expect(mocks.pool).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["throw", "empty"])("export %s exits 1 without opening a pool", async (failure) => {
    if (failure === "throw") mocks.export.mockImplementationOnce(() => { throw new Error("export exit 1"); });
    else mocks.export.mockReturnValueOnce("  \n");
    expect(await run(["--apply"])).toBe(1);
    expect(mocks.pool).not.toHaveBeenCalled();
  });
  it("applies only missing statements between BEGIN and COMMIT on the same client", async () => {
    expect(await run(["--apply"])).toBe(0);
    const queries = mocks.query.mock.calls.map(([sql]) => sql.trim());
    expect(queries[0]).toBe("BEGIN");
    expect(queries.slice(4)).toEqual(["SET LOCAL search_path = pg_catalog", ...planApply(batch(table + index + constraint), empty), "COMMIT"]);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("rolls back a failing statement and never executes the rest or commits", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("CREATE UNIQUE INDEX")) throw new Error("injected failure");
      return { rows: [] };
    });
    expect(await run(["--apply"])).toBe(1);
    const queries = mocks.query.mock.calls.map(([sql]) => sql.trim());
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(queries.some((sql) => sql.startsWith("ALTER TABLE"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
  it("maps catalog types, skips existing objects, and rolls back column drift before DDL", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: columns.map((c) => ({ table_name: "companies", column_name: c.name, data_type: c.type === "text[]" ? "ARRAY" : c.type, udt_name: c.type === "text[]" ? "_text" : c.type, is_nullable: c.nullable ? "YES" : "NO" })) };
      if (sql.includes("pg_catalog.pg_indexes")) return { rows: [{ name: "uq_companies_name", table: "companies" }] };
      if (sql.includes("pg_catalog.pg_constraint")) return { rows: [{ name: "fk_contacts_company", table: "contacts" }] };
      return { rows: [] };
    });
    expect(await run(["--apply"])).toBe(0);
    expect(mocks.query.mock.calls.some(([sql]) => /^(CREATE|ALTER)/.test(sql))).toBe(false);
    mocks.export.mockReturnValue(table.replace('"name" text NOT NULL,', "") + index);
    mocks.query.mockClear();
    expect(await run(["--apply"])).toBe(1);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.query.mock.calls.some(([sql]) => /^(CREATE|ALTER)/.test(sql))).toBe(false);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringContaining("reviewed manual migration"));
  });
  it("closes the pool even if checking out a connection fails", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("connection failed"));
    expect(await run([])).toBe(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("rolls back and closes the connection and pool if a catalog read fails", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.columns")) throw new Error("catalog unavailable");
      return { rows: [] };
    });
    expect(await run(["--apply"])).toBe(1);
    expect(mocks.query.mock.calls.map(([sql]) => sql.trim())).toEqual(["BEGIN", expect.stringContaining("information_schema.columns"), "ROLLBACK"]);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
