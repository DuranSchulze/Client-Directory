import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { attachAll } from "@/services/needs-company.service";

export const POST = handle(async () => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await attachAll() });
});
