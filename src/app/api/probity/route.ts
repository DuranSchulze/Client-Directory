import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getProbity, saveProbity } from "@/services/probity.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return Response.json({ items: await getProbity() });
});
export const POST = handle(async (request: Request) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await saveProbity(await jsonBody(request)) }, { status: 201 });
});
