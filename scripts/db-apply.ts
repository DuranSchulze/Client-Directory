import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { DIRECTORY_TABLES } from "../src/db/directory-tables";

type Token = { raw: string; kind: "word" | "identifier" | "string" | "number" | "symbol" };
export type Column = { name: string; type: string; nullable: boolean };
type Declaration = { kind: "table" | "index" | "constraint"; name: string; table: string; sql: string; columns: Column[] };
export type LiveCatalog = {
  tables: { name: string; columns: Column[] }[];
  indexes: { name: string; table: string }[];
  constraints: { name: string; table: string }[];
};
class SchemaError extends Error {}
function refuse(): never { throw new SchemaError("Refused SQL: only supported directory CREATE TABLE, CREATE INDEX and ADD CONSTRAINT statements in public are allowed."); }

// A closed grammar prevents expressions from calling arbitrary functions or reading other objects.
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  for (let p = 0; p < sql.length;) {
    if (/\s/.test(sql[p])) { p++; continue; }
    if (sql.startsWith("--", p)) { const end = sql.indexOf("\n", p); p = end < 0 ? sql.length : end + 1; continue; }
    if (sql.startsWith("/*", p)) {
      p += 2;
      let depth = 1;
      while (p < sql.length && depth) {
        if (sql.startsWith("/*", p)) { depth++; p += 2; }
        else if (sql.startsWith("*/", p)) { depth--; p += 2; }
        else p++;
      }
      if (depth) refuse();
      continue;
    }
    const start = p, quote = sql[p];
    if (quote === "'" || quote === '"') {
      p++;
      let closed = false;
      while (p < sql.length) {
        if (sql[p] === "\\") refuse();
        if (sql[p++] !== quote) continue;
        if (sql[p] === quote) { p++; continue; }
        closed = true; break;
      }
      if (!closed) refuse();
      tokens.push({ raw: sql.slice(start, p), kind: quote === "'" ? "string" : "identifier" });
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(p));
    const number = /^\d+(?:\.\d+)?/.exec(sql.slice(p));
    if (word || number) {
      const raw = (word ?? number)![0]; p += raw.length;
      tokens.push({ raw, kind: word ? "word" : "number" });
    } else {
      if (!"(),.;[]=+-".includes(sql[p])) refuse();
      tokens.push({ raw: sql[p++], kind: "symbol" });
    }
  }
  return tokens;
}
export function parseStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: Token[] = [];
  for (const token of tokenize(sql)) {
    if (token.raw === ";") {
      if (current.length) statements.push(current.map((t) => t.raw).join(" "));
      current = [];
    } else current.push(token);
  }
  if (current.length) statements.push(current.map((t) => t.raw).join(" "));
  return statements;
}

class StatementParser {
  private pos = 0;
  constructor(private tokens: Token[]) {}
  private take(value: string): boolean {
    const token = this.tokens[this.pos];
    if (!token || token.kind === "string" || token.kind === "identifier" || token.raw.toLowerCase() !== value.toLowerCase()) return false;
    this.pos++; return true;
  }
  private expect(value: string) { if (!this.take(value)) refuse(); }
  private identifier(): string {
    const token = this.tokens[this.pos++];
    if (!token || !["identifier", "word"].includes(token.kind)) refuse();
    const name = token.kind === "identifier" ? token.raw.slice(1, -1) : token.raw.toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(name) || name.length > 63) refuse();
    return name;
  }
  private table(): string {
    const start = this.pos;
    let name = this.identifier();
    if (this.take(".")) { if (name !== "public") refuse(); name = this.identifier(); }
    if (!DIRECTORY_TABLES.includes(name)) refuse();
    // Qualify relations so the runner can restrict search_path to pg_catalog.
    this.tokens.splice(start, this.pos - start, { raw: `"public"."${name}"`, kind: "identifier" });
    this.pos = start + 1;
    return name;
  }
  private literal() {
    const token = this.tokens[this.pos];
    if (token?.kind === "string" || token?.kind === "number") { this.pos++; return; }
    if (this.take("true") || this.take("false") || this.take("null")) return;
    if (this.take("-") || this.take("+")) {
      if (this.tokens[this.pos++]?.kind !== "number") refuse();
      return;
    }
    refuse();
  }
  private column(): Column {
    const name = this.identifier();
    let nullable = !["serial", "bigserial"].includes(this.tokens[this.pos]?.raw.toLowerCase());
    let type: string;
    if (this.take("bigserial") || this.take("bigint")) type = "bigint";
    else if (this.take("serial") || this.take("integer")) type = "integer";
    else if (this.take("text")) { type = "text"; if (this.take("[")) { this.expect("]"); type = "text[]"; } }
    else if (this.take("boolean")) type = "boolean";
    else if (this.take("date")) type = "date";
    else if (this.take("timestamp")) { this.expect("with"); this.expect("time"); this.expect("zone"); type = "timestamp with time zone"; }
    else refuse();
    let primary = false, hasDefault = false, hasNullability = false;
    for (;;) {
      if (this.take("primary")) { if (primary) refuse(); this.expect("key"); primary = true; nullable = false; }
      else if (this.take("not")) { if (hasNullability) refuse(); this.expect("null"); hasNullability = true; nullable = false; }
      else if (this.take("default")) {
        if (hasDefault) refuse(); hasDefault = true;
        if (this.take("now")) {
          this.tokens[this.pos - 1].raw = "pg_catalog.now";
          this.expect("("); this.expect(")");
        } else this.literal();
      } else break;
    }
    return { name, type, nullable };
  }
  private columns() {
    this.expect("("); this.identifier();
    while (this.take(",")) this.identifier();
    this.expect(")");
  }
  private columnRef(table: string) {
    const name = this.identifier();
    if (this.take(".")) { if (name !== table) refuse(); this.identifier(); }
  }
  private indexTerm(table: string) {
    if (this.take("coalesce")) {
      this.expect("("); this.columnRef(table); this.expect(","); this.literal(); this.expect(")");
    } else this.columnRef(table);
  }
  parse(): Declaration {
    let kind: Declaration["kind"], name: string, table: string;
    const columns: Column[] = [];
    if (this.take("create")) {
      if (this.take("table")) {
        kind = "table"; table = name = this.table(); this.expect("(");
        do { columns.push(this.column()); } while (this.take(","));
        this.expect(")");
        if (new Set(columns.map((c) => c.name)).size !== columns.length) refuse();
      } else {
        this.take("unique"); this.expect("index"); kind = "index"; name = this.identifier();
        this.expect("on"); table = this.table();
        if (this.take("using") && !(this.take("btree") || this.take("gin"))) refuse();
        this.expect("("); this.indexTerm(table); while (this.take(",")) this.indexTerm(table); this.expect(")");
        if (this.take("where")) {
          this.columnRef(table);
          if (this.take("is")) { this.take("not"); this.expect("null"); }
          else { this.expect("="); this.literal(); }
        }
      }
    } else {
      this.expect("alter"); this.expect("table"); table = this.table();
      this.expect("add"); this.expect("constraint"); name = this.identifier(); kind = "constraint";
      if (this.take("foreign")) {
        this.expect("key"); this.columns(); this.expect("references"); this.table(); this.columns();
        const actions = new Set<string>();
        while (this.take("on")) {
          const action = this.take("delete") ? "delete" : this.take("update") ? "update" : refuse();
          if (actions.has(action)) refuse(); actions.add(action);
          // FK CASCADE is confined to owned tables; destructive DROP ... CASCADE is never accepted.
          if (this.take("no")) this.expect("action");
          else if (this.take("set")) this.expect("null");
          else if (!(this.take("cascade") || this.take("restrict"))) refuse();
        }
      } else if (this.take("primary")) { this.expect("key"); this.columns(); }
      else if (this.take("unique")) this.columns();
      else refuse();
    }
    if (this.pos !== this.tokens.length) refuse();
    return { kind, name, table, columns, sql: this.tokens.map((t) => t.raw).join(" ") + ";" };
  }
}
export function validateBatch(statements: readonly string[]): Declaration[] {
  if (!statements.length) throw new SchemaError("Schema export is empty.");
  return statements.map((sql) => new StatementParser(tokenize(sql)).parse());
}
export function planApply(statements: readonly string[], live: LiveCatalog): string[] {
  const declarations = validateBatch(statements);
  return declarations.filter((item) => {
    if (item.kind === "table") {
      const existing = live.tables.find((t) => t.name === item.name);
      if (!existing) return true;
      const shape = (columns: Column[]) => JSON.stringify([...columns].sort((a, b) => a.name.localeCompare(b.name)).map(({ name, type, nullable }) => [name, type, nullable]));
      if (shape(existing.columns) !== shape(item.columns)) throw new SchemaError(`Column drift on public.${item.name}; write a reviewed manual migration. No schema changes were applied.`);
      return false;
    }
    return !(item.kind === "index" ? live.indexes : live.constraints).some((obj) => obj.name === item.name && obj.table === item.table);
  }).map((item) => item.sql);
}

async function readCatalog(client: PoolClient): Promise<LiveCatalog> {
  const { rows } = await client.query<{ table_name: string; column_name: string | null; data_type: string; udt_name: string; is_nullable: string }>(`
    SELECT t.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
    FROM information_schema.tables t LEFT JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = ANY($1::text[])
  `, [DIRECTORY_TABLES]);
  const tables = new Map<string, Column[]>();
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    if (row.column_name) tables.get(row.table_name)!.push({ name: row.column_name, type: row.data_type === "ARRAY" ? row.udt_name.slice(1) + "[]" : row.data_type, nullable: row.is_nullable === "YES" });
  }
  const indexes = await client.query<{ name: string; table: string }>(`SELECT indexname AS name, tablename AS "table" FROM pg_catalog.pg_indexes WHERE schemaname = 'public'`);
  const constraints = await client.query<{ name: string; table: string }>(`
    SELECT c.conname AS name, t.relname AS "table" FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
  `);
  return { tables: [...tables].map(([name, columns]) => ({ name, columns })), indexes: indexes.rows, constraints: constraints.rows };
}
export async function run(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.some((arg) => arg !== "--apply") || args.length > 1) throw new SchemaError("Usage: db-apply.ts [--apply]");
    const require = createRequire(import.meta.url);
    let exported: string;
    try { exported = execFileSync(process.execPath, [resolve(dirname(require.resolve("drizzle-kit")), "bin.cjs"), "export"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { throw new SchemaError("drizzle-kit export failed; no schema changes were applied."); }
    const statements = parseStatements(exported);
    validateBatch(statements);
    if (!process.env.DATABASE_URL) throw new SchemaError("Set DATABASE_URL to inspect the schema.");
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const client = await pool.connect();
      let begun = false;
      try {
        if (args.includes("--apply")) { await client.query("BEGIN"); begun = true; }
        const plan = planApply(statements, await readCatalog(client));
        console.log(`${begun ? "Apply" : "Dry run"}: ${plan.length} missing objects.`);
        for (const sql of plan) console.log(sql);
        if (begun) {
          await client.query("SET LOCAL search_path = pg_catalog");
          for (const sql of plan) await client.query(sql);
          await client.query("COMMIT"); begun = false;
        } else console.log("No writes. Run npm run db:apply to apply this plan.");
      } catch (error) {
        if (begun) await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } finally { await pool.end(); }
    return 0;
  } catch (error) {
    console.error(error instanceof SchemaError ? error.message : "Schema bootstrap failed; check database access. Any open transaction was rolled back.");
    return 1;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void run().then((code) => { process.exitCode = code; });
}
