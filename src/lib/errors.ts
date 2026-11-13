export class AppError extends Error {
  constructor(public status: number, message: string, public field?: string) { super(message); }
}
export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && error.code === "23505") return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}
