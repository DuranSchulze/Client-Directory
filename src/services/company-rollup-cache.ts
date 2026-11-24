import { withTransaction, type Tx } from "@/db";
import type { CompanyListItem } from "@/lib/api-types";

const TTL_MS = 60_000;
let cached: { rows: CompanyListItem[]; expiresAt: number } | undefined;
let inFlight: Promise<CompanyListItem[]> | undefined;

export function readCompanyRollupCache(build: () => Promise<CompanyListItem[]>): Promise<CompanyListItem[]> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.rows);
  if (inFlight) return inFlight;

  const pending = build().then((rows) => {
    // A committed write can detach this read before its older snapshot completes.
    if (inFlight === pending) cached = { rows, expiresAt: Date.now() + TTL_MS };
    return rows;
  }).finally(() => {
    if (inFlight === pending) inFlight = undefined;
  });
  inFlight = pending;
  return pending;
}

export function invalidateCompanyRollupCache() {
  cached = undefined;
  inFlight = undefined;
}

export async function writeCompanyRollups<T>(write: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await withTransaction(write);
  invalidateCompanyRollupCache();
  return result;
}
