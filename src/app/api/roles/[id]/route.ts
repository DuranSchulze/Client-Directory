import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { patchRole, removeRole } from "@/services/accounts.service";
import { id, jsonBody } from "@/services/validation.service";

type Context = { params: Promise<{ id: string }> };
export const PATCH = handle(async (request: Request, context: Context) => {
  const actor = await requireRouteAccess("accounts");
  return Response.json({ item: await patchRole(actor.id, id((await context.params).id), await jsonBody(request)) });
});
export const DELETE = handle(async (_request: Request, context: Context) => {
  const actor = await requireRouteAccess("accounts");
  await removeRole(actor.id, id((await context.params).id));
  return Response.json({ ok: true });
});
