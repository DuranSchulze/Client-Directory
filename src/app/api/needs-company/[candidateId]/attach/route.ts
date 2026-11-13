import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { attachCandidate } from "@/services/needs-company.service";
import { id, jsonBody } from "@/services/validation.service";
type Context = { params: Promise<{ candidateId: string }> };

export const POST = handle(async (request: Request, context: Context) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await attachCandidate(id((await context.params).candidateId, "candidateId"), await jsonBody(request)) });
});
