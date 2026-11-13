import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { readUpload } from "@/lib/import/upload";
import { importWorkbook } from "@/services/import.service";

export const POST = handle(async (request: Request) => {
  await requireSession();
  const user = await requireRouteAccess("directory");
  const { data, check } = await readUpload(request);
  return Response.json(await importWorkbook(data, check, user.email), { headers: { "Cache-Control": "no-store" } });
});
