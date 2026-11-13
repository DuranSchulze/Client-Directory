import type { RouteKey } from "@/lib/routes";

/** Grants that open a page, in nav order; the first granted one is the account's home. */
export const HOMES: readonly [RouteKey, string][] = [["directory", "/clients"], ["import", "/import"], ["accounts", "/accounts"]];
export const NO_ACCESS = "/no-access";
export const homeFor = (routes: readonly RouteKey[]) => HOMES.find(([r]) => routes.includes(r))?.[1] ?? NO_ACCESS;

/** The grant a page path needs; null for pages every signed-in account may open. */
export function routeFor(pathname: string): RouteKey | null {
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (under("/import")) return "import";
  if (under("/accounts")) return "accounts";
  if (under(NO_ACCESS) || pathname === "/") return null;
  return "directory";
}
