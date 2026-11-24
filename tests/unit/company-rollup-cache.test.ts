import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CompanyListItem } from "@/lib/api-types";
import { invalidateCompanyRollupCache, readCompanyRollupCache, writeCompanyRollups } from "@/services/company-rollup-cache";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ withTransaction: transaction }));

beforeEach(() => invalidateCompanyRollupCache());
afterEach(() => vi.useRealTimers());

it("reuses one built snapshot until the 60-second TTL expires", async () => {
  vi.useFakeTimers();
  const build = vi.fn(async () => [] as CompanyListItem[]);
  const first = await readCompanyRollupCache(build);
  vi.advanceTimersByTime(59_999);
  expect(await readCompanyRollupCache(build)).toBe(first);
  expect(build).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(await readCompanyRollupCache(build)).not.toBe(first);
  expect(build).toHaveBeenCalledTimes(2);
});

it("shares concurrent misses and keeps an invalidated in-flight read from repopulating the cache", async () => {
  let complete = (_rows: CompanyListItem[]) => {};
  const old = new Promise<CompanyListItem[]>((resolve) => { complete = resolve; });
  const build = vi.fn(() => old);
  const first = readCompanyRollupCache(build);
  expect(readCompanyRollupCache(build)).toBe(first);
  expect(build).toHaveBeenCalledTimes(1);
  invalidateCompanyRollupCache();
  const newer: CompanyListItem[] = [];
  const refresh = vi.fn(async () => newer);
  expect(await readCompanyRollupCache(refresh)).toBe(newer);
  complete([]);
  expect(await first).not.toBe(newer);
  expect(await readCompanyRollupCache(refresh)).toBe(newer);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("retries a failed build and invalidates only after the write transaction succeeds", async () => {
  const build = vi.fn<() => Promise<CompanyListItem[]>>()
    .mockRejectedValueOnce(new Error("read failed")).mockImplementation(async () => []);
  await expect(readCompanyRollupCache(build)).rejects.toThrow("read failed");
  const warm = await readCompanyRollupCache(build);
  transaction.mockRejectedValueOnce(new Error("rolled back"));
  await expect(writeCompanyRollups(async () => null)).rejects.toThrow("rolled back");
  expect(await readCompanyRollupCache(build)).toBe(warm);
  let commit = (_value: boolean) => {};
  transaction.mockImplementationOnce(() => new Promise<boolean>((resolve) => { commit = resolve; }));
  const writing = writeCompanyRollups(async () => true);
  expect(await readCompanyRollupCache(build)).toBe(warm);
  commit(true);
  expect(await writing).toBe(true);
  expect(await readCompanyRollupCache(build)).not.toBe(warm);
});
