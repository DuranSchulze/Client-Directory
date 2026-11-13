import { AppError, isUniqueViolation } from "@/lib/errors";

export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try { return await fn(...args); }
    catch (error) {
      if (error instanceof AppError) {
        return Response.json({ error: error.message, ...(error.field ? { field: error.field } : {}) }, { status: error.status });
      }
      if (isUniqueViolation(error)) return Response.json({ error: "A record with these values already exists." }, { status: 409 });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
