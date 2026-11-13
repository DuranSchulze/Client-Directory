import { requireRouteAccess } from "@/lib/auth/guard";
import { handle } from "@/lib/http/handle";
import { companiesCsv } from "@/lib/csv";
import { getCompanies } from "@/services/companies.service";

export const GET = handle(async () => {
  await requireRouteAccess("directory");
  return new Response(companiesCsv(await getCompanies()), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="clients.csv"', "Cache-Control": "no-store",
  } });
});
