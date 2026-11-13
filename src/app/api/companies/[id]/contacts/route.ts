import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getContacts, saveContact } from "@/services/contacts.service";
import { id, jsonBody } from "@/services/validation.service";
type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, context: Context) => {
  await requireRouteAccess("directory");
  return Response.json({ items: await getContacts(id((await context.params).id)) });
});
export const POST = handle(async (request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await saveContact(id((await context.params).id), await jsonBody(request)) }, { status: 201 });
});
