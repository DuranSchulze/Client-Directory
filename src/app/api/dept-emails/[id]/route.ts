import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getDeptEmail, saveDeptEmail } from "@/services/dept-emails.service";
import { id, jsonBody } from "@/services/validation.service";
type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, context: Context) => {
  await requireRouteAccess("directory");
  return Response.json({ item: await getDeptEmail(id((await context.params).id)) });
});
export const PATCH = handle(async (request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await saveDeptEmail(await jsonBody(request), id((await context.params).id)) });
});
