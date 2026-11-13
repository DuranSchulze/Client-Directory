import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { createRole, getRoles } from "@/services/accounts.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async () => {
  await requireRouteAccess("accounts");
  return Response.json({ items: await getRoles() }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = handle(async (request: Request) => {
  const actor = await requireRouteAccess("accounts");
  return Response.json({ item: await createRole(actor.id, await jsonBody(request)) }, { status: 201 });
});
