import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getScrapeStatus } from "@/services/scrape.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return Response.json({ item: await getScrapeStatus() });
});
