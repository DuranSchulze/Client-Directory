import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { createAccount, getAccounts } from "@/services/accounts.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async () => {
  await requireRouteAccess("accounts");
  return Response.json({ items: await getAccounts() }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = handle(async (request: Request) => {
  const actor = await requireRouteAccess("accounts");
  return Response.json({ item: await createAccount(actor.id, await jsonBody(request)) }, { status: 201 });
});
