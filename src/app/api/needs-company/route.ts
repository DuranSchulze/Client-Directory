import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getNeedsCompany } from "@/services/needs-company.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return Response.json({ items: await getNeedsCompany() });
});
