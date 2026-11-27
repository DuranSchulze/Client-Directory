import { requireVerifiedUser, sessionUser } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";

export const GET = handle(async () => {
  const item = sessionUser(await requireVerifiedUser());
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
});
