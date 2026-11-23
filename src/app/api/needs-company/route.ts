import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getNeedsCompany } from "@/services/needs-company.service";

export const GET = handle(async (req: Request) => {
  await requireRouteAccess("directory");
  const { searchParams } = new URL(req.url);
  return Response.json(await getNeedsCompany({
    page: searchParams.get("page"), size: searchParams.get("size"), q: searchParams.get("q"),
  }));
});
