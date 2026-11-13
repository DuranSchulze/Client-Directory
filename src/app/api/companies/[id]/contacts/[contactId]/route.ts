import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { removeContact, saveContact } from "@/services/contacts.service";
import { id, jsonBody } from "@/services/validation.service";
type Context = { params: Promise<{ id: string; contactId: string }> };

export const PATCH = handle(async (request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  const params = await context.params;
  return Response.json({ item: await saveContact(id(params.id), await jsonBody(request), id(params.contactId, "contactId")) });
});
export const DELETE = handle(async (_request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  const params = await context.params;
  await removeContact(id(params.id), id(params.contactId, "contactId"));
  return Response.json({ ok: true });
});
