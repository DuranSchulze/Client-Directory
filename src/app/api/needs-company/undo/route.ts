import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { undoAttach } from "@/services/needs-company.service";
import { jsonBody } from "@/services/validation.service";

export const POST = handle(async (request: Request) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await undoAttach(await jsonBody(request)) });
});
