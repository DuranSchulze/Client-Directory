"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { countsQuery, scrapeStatusQuery } from "@/lib/api/queries";

function since(at: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** When this module's data last changed: the last Excel upload, or the last finished scrape. Nothing while loading. */
export function LastUpdatedNote({ source }: { source: "excel" | "scraper" }) {
  const counts = useQuery({ ...countsQuery, enabled: source === "excel" });
  const scrape = useQuery({ ...scrapeStatusQuery, enabled: source === "scraper" });
  const loaded = source === "excel" ? counts.data !== undefined : scrape.data !== undefined;
  if (!loaded) return null;
  const at = source === "excel" ? counts.data?.lastMasterUpload?.at ?? null : scrape.data?.lastFinishedAt ?? null;
  const by = source === "excel" ? counts.data?.lastMasterUpload?.by : undefined;
  return (
    <span className="inline-flex w-fit max-w-full items-start gap-2 rounded-lg bg-accent px-3 py-1 text-xs text-muted-foreground">
      <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        {!at ? (source === "excel" ? "Not updated yet: no Excel uploaded" : "Not updated yet: no scrape has finished")
          : <>Last updated {source === "excel" ? "from the Excel upload" : "by the Scraper"}{" "}
            <time dateTime={at} title={new Date(at).toLocaleString()} className="font-semibold text-foreground">{since(at)}</time>
            {by && <> by {by}</>}</>}
      </span>
    </span>
  );
}
