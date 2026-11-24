import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getDeptEmails, getDeptEmailsPage, saveDeptEmail } from "@/services/dept-emails.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async (request: Request) => {
  await requireRouteAccess("directory");
  const params = new URL(request.url).searchParams;
  if (params.has("page")) return Response.json(await getDeptEmailsPage(params));
  return Response.json({ items: await getDeptEmails() });
});
export const POST = handle(async (request: Request) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await saveDeptEmail(await jsonBody(request)) }, { status: 201 });
});
