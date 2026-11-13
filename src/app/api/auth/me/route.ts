import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";

export const GET = handle(async () => {
  const item = await requireRouteAccess("directory");
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
});
