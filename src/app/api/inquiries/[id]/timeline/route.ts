import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getInquiryTimeline } from "@/services/inquiries.service";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  await requireRouteAccess("directory");
  return Response.json({ item: await getInquiryTimeline((await params).id) });
});
