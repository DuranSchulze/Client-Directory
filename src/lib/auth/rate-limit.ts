import { AppError } from "@/lib/errors";

// shortcut: per-instance limits reset on serverless cold starts; use a shared store before scaling out.
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
export function clearLoginLimit(request: Request): void {
  attempts.delete(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown");
}
export function limitLogin(request: Request): void {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const attempt = attempts.get(key);
  if (attempt && attempt.count >= 5) throw new AppError(429, "Too many login attempts. Try again later.");
  if (!attempt && attempts.size >= 10000) throw new AppError(429, "Too many login attempts. Try again later.");
  attempts.set(key, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + WINDOW_MS });
}
