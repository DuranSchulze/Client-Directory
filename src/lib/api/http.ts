import type { ApiError as ApiErrorBody } from "@/lib/api-types";

/** Error carrying the HTTP status and, for validation errors, the field the server rejected. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public field?: string) { super(message); }
}

export async function request<T>(path: string, opts?: { method?: string; json?: unknown; body?: BodyInit; fallback?: string }): Promise<T> {
  const hasJson = opts?.json !== undefined;
  const res = await fetch(path, {
    method: opts?.method ?? (hasJson || opts?.body ? "POST" : "GET"),
    headers: hasJson ? { "Content-Type": "application/json" } : undefined,
    body: hasJson ? JSON.stringify(opts!.json) : opts?.body,
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(body?.error ?? opts?.fallback ?? `Request failed (${res.status})`, res.status, body?.field);
  }
  return res.json() as Promise<T>;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
