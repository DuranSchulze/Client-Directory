"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorState, Loadable, PlaceholderRows } from "./loadable";
import { rowKeyActivates } from "@/lib/ui-helpers";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T, index: number) => React.ReactNode;
  /** Present = sortable. Numbers sort numerically, strings by locale; null/undefined sort last. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  /** Hidden below the md breakpoint (phone keeps the essentials). */
  desktopOnly?: boolean;
};
export type Sort = { key: string; dir: "asc" | "desc" } | null;

const SIZES = [10, 25, 50, 100];

function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "" ? 0 : 1;
  if (b === null || b === undefined || b === "") return -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The app's one table: card with title, count and search, sortable headers, row numbers and a pager. Rows arrive filtered, never pre-sorted. */
export function DataTableCard<T>({
  title, rows, total, columns, getRowId, onRowClick, rowLabel, search, actions, empty, itemLabel = "rows",
  loading, refetching, error, onRetry, sort: sortProp, onSortChange, page: pageProp, onPageChange, size: sizeProp, onSizeChange,
  rowClassName, showRowNumbers = true, groupBy,
}: {
  title: string; rows: T[]; total?: number; columns: Column<T>[]; getRowId: (row: T) => string | number;
  onRowClick?: (row: T) => void; rowLabel?: (row: T) => string; search?: React.ReactNode; actions?: React.ReactNode;
  empty: React.ReactNode; itemLabel?: string; loading?: boolean; refetching?: boolean; error?: string | null; onRetry?: () => void;
  sort?: Sort; onSortChange?: (s: Sort) => void; page?: number; onPageChange?: (p: number) => void; size?: number; onSizeChange?: (s: number) => void;
  rowClassName?: (row: T) => string | undefined; showRowNumbers?: boolean;
  /** Optional group heading rows (for example department), rendered before the first row of each group. */
  groupBy?: (row: T) => string;
}) {
  const [sortLocal, setSortLocal] = useState<Sort>(null);
  const [pageLocal, setPageLocal] = useState(1);
  const [sizeLocal, setSizeLocal] = useState(25);
  const sort = sortProp !== undefined ? sortProp : sortLocal;
  const size = sizeProp ?? sizeLocal;
  // A controlled parent resets its own page in the same update (one URL replace); two replaces would race and drop the first.
  const setSort = (s: Sort) => { if (onSortChange) onSortChange(s); else { setSortLocal(s); setPageLocal(1); } };
  const setPage = (p: number) => (onPageChange ?? setPageLocal)(p);
  const setSize = (s: number) => { if (onSizeChange) onSizeChange(s); else { setSizeLocal(s); setPageLocal(1); } };

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => compare(get(a), get(b)));
    return sort!.dir === "desc" ? out.reverse() : out;
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const page = Math.min(Math.max(1, pageProp ?? pageLocal), pages);
  // Clamp a stale page (rows shrank) back into range.
  useEffect(() => { if ((pageProp ?? pageLocal) > pages) setPage(pages); });
  const start = (page - 1) * size;
  const visible = sorted.slice(start, start + size);

  const cycle = (key: string) => setSort(!sort || sort.key !== key ? { key, dir: "asc" } : sort.dir === "asc" ? { key, dir: "desc" } : null);

  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-edge bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-muted-foreground">{title}</h2>
        <span className="text-sm font-bold text-primary-text tabular-nums">
          {loading ? "…" : total !== undefined && total !== rows.length ? `${rows.length} of ${total}` : rows.length}
        </span>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">{search}{actions}</div>
      </div>
      {error ? <ErrorState message={error} onRetry={onRetry} /> : loading ? <PlaceholderRows /> : rows.length === 0 ? empty : (
        <Loadable loading={!!refetching}>
          <div className="overflow-x-auto px-2">
            <table className="w-full border-separate border-spacing-y-0.5 text-sm">
              <thead>
                <tr>
                  {showRowNumbers && <th scope="col" className="hidden w-10 rounded-l-lg bg-head py-2.5 pr-1 pl-3 text-right text-xs font-bold md:table-cell"><span className="sr-only">Row</span>#</th>}
                  {columns.map((c, i) => {
                    const dir = sort?.key === c.key ? sort.dir : null;
                    const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
                    return (
                      <th key={c.key} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : c.sortValue ? "none" : undefined}
                        className={cn("bg-head px-3 py-2.5 text-left text-xs font-bold tracking-wide whitespace-nowrap",
                          i === 0 && !showRowNumbers && "rounded-l-lg", i === 0 && showRowNumbers && "max-md:rounded-l-lg",
                          i === columns.length - 1 && "rounded-r-lg", dir && "bg-[color-mix(in_srgb,var(--primary)_14%,var(--head))] text-primary-text",
                          c.desktopOnly && "hidden md:table-cell", c.className)}>
                        {c.sortValue ? (
                          <button type="button" onClick={() => cycle(c.key)} className="inline-flex items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {c.header}<Icon aria-hidden className={cn("size-3.5", !dir && "opacity-40")} />
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const group = groupBy?.(row);
                  const showGroup = group !== undefined && (i === 0 || groupBy!(visible[i - 1]) !== group);
                  return [
                    showGroup && (
                      <tr key={`g-${group}-${i}`}>
                        <th colSpan={columns.length + (showRowNumbers ? 1 : 0)} scope="rowgroup" className="px-3 pt-5 pb-1.5 text-left text-[13px] font-bold">{group}</th>
                      </tr>
                    ),
                    <tr key={getRowId(row)} tabIndex={onRowClick ? 0 : undefined} aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={onRowClick ? (e) => { if (rowKeyActivates(e)) { e.preventDefault(); onRowClick(row); } } : undefined}
                      className={cn("group/row", onRowClick && "cursor-pointer outline-none focus-visible:[&>td]:bg-lift", rowClassName?.(row))}>
                      {showRowNumbers && <td className="hidden rounded-l-lg py-3 pr-1 pl-3 text-right text-muted-foreground tabular-nums group-hover/row:bg-lift md:table-cell">{start + i + 1}</td>}
                      {columns.map((c, ci) => (
                        <td key={c.key} className={cn("px-3 py-3 align-middle transition-colors group-hover/row:bg-lift",
                          ci === 0 && !showRowNumbers && "rounded-l-lg", ci === 0 && showRowNumbers && "max-md:rounded-l-lg", ci === columns.length - 1 && "rounded-r-lg",
                          c.desktopOnly && "hidden md:table-cell", c.className)}>
                          {c.render(row, start + i)}
                        </td>
                      ))}
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3 pb-4 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Showing {start + 1} to {Math.min(start + size, sorted.length)} of {sorted.length} {itemLabel}</span>
            <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
              <label className="flex items-center gap-2">Rows
                <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="field-select h-8 bg-sunk dark:bg-field">
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
                <span className="min-w-14 text-center tabular-nums">{page} / {pages}</span>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
              </span>
            </div>
          </div>
        </Loadable>
      )}
    </section>
  );
}

/** Search box for the table header; `/` focuses it when slashFocus is set. */
export function TableSearch({ value, onChange, placeholder, slashFocus }: { value: string; onChange: (v: string) => void; placeholder: string; slashFocus?: boolean }) {
  useEffect(() => {
    if (!slashFocus) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      document.getElementById("table-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slashFocus]);
  return (
    <div className="relative w-full sm:w-72">
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input id="table-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="field-input h-8 pr-9 pl-9" />
      {slashFocus && <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded bg-accent px-1.5 text-[11px] text-muted-foreground sm:block">/</kbd>}
    </div>
  );
}
