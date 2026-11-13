import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getCompanies, createCompany } from "@/services/companies.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return Response.json({ items: await getCompanies() });
});
export const POST = handle(async (request: Request) => {
  await requireSession();
  const user = await requireRouteAccess("directory");
  return Response.json({ item: await createCompany(await jsonBody(request), user.email) }, { status: 201 });
});
