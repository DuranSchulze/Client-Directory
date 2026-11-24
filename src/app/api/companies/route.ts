import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getCompanies, getCompaniesPage, createCompany } from "@/services/companies.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async (request: Request) => {
  await requireRouteAccess("directory");
  const params = new URL(request.url).searchParams;
  if (params.has("page")) return Response.json(await getCompaniesPage(params));
  return Response.json({ items: await getCompanies() });
});
export const POST = handle(async (request: Request) => {
  await requireSession();
  const user = await requireRouteAccess("directory");
  return Response.json({ item: await createCompany(await jsonBody(request), user.email) }, { status: 201 });
});
