import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { patchAccountRole } from "@/services/accounts.service";
import { id, jsonBody } from "@/services/validation.service";

export const PATCH = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireRouteAccess("accounts");
  return Response.json({ item: await patchAccountRole(actor.id, id((await context.params).id), await jsonBody(request)) });
});
