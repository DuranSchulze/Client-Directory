import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getTemporaryPassword } from "@/services/accounts.service";
import { id } from "@/services/validation.service";

type Context = { params: Promise<{ id: string }> };
const reveal = handle(async (_request: Request, context: Context) => {
  const actor = await requireRouteAccess("accounts");
  return Response.json(await getTemporaryPassword(actor, id((await context.params).id)));
});

export async function GET(request: Request, context: Context) {
  const response = await reveal(request, context);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
