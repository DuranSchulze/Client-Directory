import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getCompany, patchCompany } from "@/services/companies.service";
import { id, jsonBody } from "@/services/validation.service";
type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, context: Context) => {
  await requireRouteAccess("directory");
  return Response.json({ item: await getCompany(id((await context.params).id)) });
});
export const PATCH = handle(async (request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await patchCompany(id((await context.params).id), await jsonBody(request)) });
});
