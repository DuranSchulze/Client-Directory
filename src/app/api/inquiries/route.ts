import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getInquiriesPage } from "@/services/inquiries.service";

export const GET = handle(async (request: Request) => {
  await requireRouteAccess("directory");
  return Response.json(await getInquiriesPage(new URL(request.url).searchParams));
});
