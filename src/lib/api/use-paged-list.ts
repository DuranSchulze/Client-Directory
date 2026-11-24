"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useUrlFilters } from "@/lib/use-url-filters";
import type { Sort } from "@/components/shared/data-table-card";
import type { PageParams } from "./queries";

const SIZES = [10, 25, 50, 100];
const PREFETCH_AT_ONCE = 3;

type PageFactory<T, K extends readonly unknown[]> = (params: PageParams) => UseQueryOptions<T, Error, T, K>;

/**
 * Loads the requested page first; once it arrives, prefetches up to `ahead` other pages of the same
 * filter (nearest first, three at a time) so paging feels instant. A filter change cancels the old prefetches.
 */
export function usePagedList<T extends { total: number }, K extends readonly unknown[]>(factory: PageFactory<T, K>, params: PageParams, ahead = 10) {
  const qc = useQueryClient();
  const query = useQuery({ ...factory(params), placeholderData: keepPreviousData });
  const page = Number(params.page);
  const size = Number(params.size);
  const total = query.data && !query.isPlaceholderData ? query.data.total : undefined;
  const filterKey = JSON.stringify({ ...params, page: null });

  useEffect(() => {
    if (total === undefined || ahead <= 0) return;
    const pages = Math.ceil(total / size);
    const queue = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p !== page)
      .sort((a, b) => Math.abs(a - page) - Math.abs(b - page) || a - b).slice(0, ahead);
    let stopped = false;
    const worker = async () => {
      while (!stopped && queue.length) await qc.prefetchQuery(factory({ ...params, page: String(queue.shift()) }));
    };
    for (let i = 0; i < PREFETCH_AT_ONCE; i++) void worker();
    return () => { stopped = true; };
    // filterKey stands in for params minus the page; factory is a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, total, page, size, ahead, qc]);

  // Leaving a filter: stop its in-flight page requests (the new filter's own request is not matched).
  useEffect(() => () => {
    void qc.cancelQueries({ predicate: (q) => {
      const last = q.queryKey[q.queryKey.length - 1] as PageParams | undefined;
      return q.queryKey.includes("page") && typeof last === "object" && JSON.stringify({ ...last, page: null }) === filterKey && q.state.fetchStatus === "fetching";
    } });
  }, [filterKey, qc]);

  return query;
}

/** URL-backed page, size, sort and search for a server-paged table. The search box commits after 300 ms and resets the page. */
export function usePagedUrlState(defaultSort?: string) {
  const { get, set } = useUrlFilters();
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);
  const size = SIZES.includes(Number(get("size"))) ? Number(get("size")) : 25;
  const sortParam = get("sort");
  const sort: Sort = sortParam ? { key: sortParam.split(":")[0], dir: sortParam.endsWith(":desc") ? "desc" : "asc" } : null;
  const q = get("q");
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const typed = qInput.trim();
    if (typed === q) return;
    const t = setTimeout(() => set({ q: typed || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [qInput, q, set]);

  const params = useMemo<PageParams>(() => {
    const out: PageParams = { page: String(page), size: String(size) };
    if (q) out.q = q;
    const s = sortParam || defaultSort;
    if (s) out.sort = s;
    return out;
  }, [page, size, q, sortParam, defaultSort]);

  return {
    params, page, size, sort, q, qInput, setQInput, get, set,
    clearSearch: () => { setQInput(""); set({ q: null, page: null }); },
    onPageChange: (p: number) => set({ page: p > 1 ? p : null }),
    onSortChange: (s: Sort) => set({ sort: s ? `${s.key}:${s.dir}` : null, page: null }),
    onSizeChange: (s: number) => set({ size: s === 25 ? null : s, page: null }),
  };
}
