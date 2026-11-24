import { ilike, or, sql, type SQLWrapper } from "drizzle-orm";

export type PageWindow = { limit: number; offset: number; search: string };
export type SortDirection = "asc" | "desc";

export function substringFilter(search: string, columns: Parameters<typeof ilike>[0][], arrays: SQLWrapper[] = []) {
  if (!search) return undefined;
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return or(
    ...columns.map((column) => ilike(column, pattern)),
    ...arrays.map((column) => sql`exists (select 1 from unnest(${column}) as entry(value) where value ilike ${pattern})`),
  );
}

export function pageOrder(column: SQLWrapper, direction: SortDirection) {
  return direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}
