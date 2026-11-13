import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { ApiError } from "./http";
import { keys } from "./queries";

/**
 * A 403 elsewhere means this account's grants changed: re-read them so the nav and page gate catch up.
 * A 403 from the grants query itself means the account was deactivated or deleted: end the session
 * instead of re-reading, which would loop.
 */
export function handleGrantError(e: unknown, qc: QueryClient, queryKey: QueryKey | undefined, endSession: () => void) {
  if (!(e instanceof ApiError) || e.status !== 403) return;
  if (queryKey?.[0] === keys.me[0]) {
    qc.removeQueries({ queryKey: keys.me });
    endSession();
    return;
  }
  void qc.invalidateQueries({ queryKey: keys.me });
}

/** Clears the cookie, then a full navigation drops every cached record. */
export function endSession() {
  void fetch("/api/auth/logout", { method: "POST" }).catch(() => {}).finally(() => {
    try { new BroadcastChannel("directory-session").postMessage("out"); } catch { /* unsupported */ }
    window.location.assign("/login");
  });
}
