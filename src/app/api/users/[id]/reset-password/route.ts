import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { resetPassword } from "@/services/accounts.service";
import { id } from "@/services/validation.service";

export const POST = handle(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireRouteAccess("accounts");
  const result = await resetPassword(actor.id, id((await context.params).id));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
});
