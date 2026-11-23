import { Bot, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Pill } from "@/components/shared/pills";
import type { CompanyListItem } from "@/lib/api-types";

export type SourceKey = "master" | "scraper" | "probity";

export const SOURCES: { key: SourceKey; label: string; hint: string; icon: typeof Bot; tone: "gold" | "info" | "success" }[] = [
  { key: "master", label: "Master list", hint: "Imported from the workbook or added by hand", icon: FileSpreadsheet, tone: "gold" },
  { key: "scraper", label: "Scraper contacts", hint: "Has contacts the Scraper attached", icon: Bot, tone: "success" },
  { key: "probity", label: "Probity", hint: "Appears in the Probity list", icon: ShieldCheck, tone: "info" },
];

// The companies table has no source column. Every client comes from the master list (import or manual add);
// the Scraper adds contacts and Probity matches rows, so those two show as extra origins.
export function sourcesOf(c: Pick<CompanyListItem, "createdBy" | "contacts" | "probity">): SourceKey[] {
  const out: SourceKey[] = ["master"];
  if (c.contacts.some((x) => x.source === "scraper")) out.push("scraper");
  if (c.probity) out.push("probity");
  return out;
}

export function SourceBadges({ company }: { company: Pick<CompanyListItem, "createdBy" | "contacts" | "probity"> }) {
  const keys = sourcesOf(company);
  return (
    <span className="flex flex-wrap gap-1">
      {SOURCES.filter((s) => keys.includes(s.key)).map(({ key, label, hint, icon: Icon, tone }) => (
        <span key={key} title={hint}><Pill tone={tone}><Icon aria-hidden className="size-3" />{label}</Pill></span>
      ))}
    </span>
  );
}
