import { withTransaction, type Tx } from "@/db";
import type { CompanyListItem, NeedsCompanyItem } from "@/lib/api-types";

const TTL_MS = 60_000;

/** One snapshot kept for 60 s; concurrent misses share one build, and a clear during a build keeps that build out of the cache. */
function ttlCache<T>() {
  let cached: { value: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;
  return {
    read(build: () => Promise<T>): Promise<T> {
      if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;
      const pending = build().then((value) => {
        // A committed write can detach this read before its older snapshot completes.
        if (inFlight === pending) cached = { value, expiresAt: Date.now() + TTL_MS };
        return value;
      }).finally(() => {
        if (inFlight === pending) inFlight = undefined;
      });
      inFlight = pending;
      return pending;
    },
    clear() { cached = undefined; inFlight = undefined; },
  };
}

const companyRollups = ttlCache<CompanyListItem[]>();
export type NeedsQueue = { items: NeedsCompanyItem[]; suggested: number };
const needsQueue = ttlCache<NeedsQueue>();

export const readCompanyRollupCache = (build: () => Promise<CompanyListItem[]>) => companyRollups.read(build);
export const readNeedsQueueCache = (build: () => Promise<NeedsQueue>) => needsQueue.read(build);

/** Every directory write that can change client rollups or the Needs-company queue clears both snapshots. */
export function invalidateCompanyRollupCache() {
  companyRollups.clear();
  needsQueue.clear();
}

export async function writeCompanyRollups<T>(write: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await withTransaction(write);
  invalidateCompanyRollupCache();
  return result;
}
