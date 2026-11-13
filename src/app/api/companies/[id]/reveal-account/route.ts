import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { AppError } from "@/lib/errors";
import { handle } from "@/lib/http/handle";
import { revealAccount } from "@/services/companies.service";
import { id } from "@/services/validation.service";
type Context = { params: Promise<{ id: string }> };

const reveal = handle(async (request: Request, context: Context) => {
  await requireSession();
  const user = await requireRouteAccess("directory");
  if (user.role !== "admin") throw new AppError(403, "Access denied");
  const accountNo = await revealAccount(id((await context.params).id), user.email, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null, userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ item: { accountNo } });
});
export async function POST(request: Request, context: Context) {
  const response = await reveal(request, context);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
