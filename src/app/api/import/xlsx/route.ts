import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { readUpload } from "@/lib/import/upload";
import { importWorkbook } from "@/services/import.service";

import { lastMasterUpload } from "@/repositories/counts.repository";

export const GET = handle(async () => {
  await requireSession();
  await requireRouteAccess("import");
  return Response.json({ item: { lastMasterUpload: await lastMasterUpload() } }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = handle(async (request: Request) => {
  await requireSession();
  const user = await requireRouteAccess("import");
  const { data, check, fileName } = await readUpload(request);
  return Response.json(await importWorkbook(data, check, user.email, fileName), { headers: { "Cache-Control": "no-store" } });
});
