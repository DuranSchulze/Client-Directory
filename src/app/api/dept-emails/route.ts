import { requireSession, requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { getDeptEmails, saveDeptEmail } from "@/services/dept-emails.service";
import { jsonBody } from "@/services/validation.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return Response.json({ items: await getDeptEmails() });
});
export const POST = handle(async (request: Request) => {
  await requireSession();
  await requireRouteAccess("directory");
  return Response.json({ item: await saveDeptEmail(await jsonBody(request)) }, { status: 201 });
});
