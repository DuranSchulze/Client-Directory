"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, RefreshCw } from "lucide-react";
import { keys, scrapeStatusQuery } from "@/lib/api/queries";
import type { ScrapeStatus } from "@/lib/api-types";

const DUE_SOON_MS = 5 * 60_000;

function span(ms: number) {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** Linear Scraper status: a sweep while a scrape runs, a filling bar in the 5 minutes before the next one, else when it last ran. */
export function ScrapeBar() {
  const { data } = useQuery(scrapeStatusQuery);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useScrapeRefresh(data);
  const running = data?.running ?? null;

  if (!data) return null;
  const nextIn = data.nextAt ? Date.parse(data.nextAt) - now : null;
  const dueSoon = !running && nextIn !== null && nextIn > 0 && nextIn <= DUE_SOON_MS;

  let text: React.ReactNode = null;
  if (running) text = <>Scraping mailboxes, started <b className="font-semibold text-foreground">{span(now - Date.parse(running.startedAt))} ago</b>{running.completed > 0 && ` · ${running.completed.toLocaleString()} processed`}</>;
  else if (dueSoon) text = <>Next scrape in <b className="font-semibold text-foreground">{span(nextIn)}</b></>;
  if (!text) return null;

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5 px-4 pb-3">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        {running ? <RefreshCw aria-hidden className="size-3.5 shrink-0 text-primary-text motion-safe:animate-spin [animation-duration:2.4s]" /> : <Clock aria-hidden className="size-3.5 shrink-0" />}
        <span>{text}</span>
      </span>
      {(running || dueSoon) && (
        <div aria-hidden className="h-[3px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)]">
          {running
            ? <div className="scrape-sweep h-full w-full" />
            : <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(1 - nextIn! / DUE_SOON_MS) * 100}%` }} />}
        </div>
      )}
    </div>
  );
}

/** A finished run may have added contacts: refresh the lists and the badge once, also when a whole run fell between two polls. */
function useScrapeRefresh(data: ScrapeStatus | undefined) {
  const qc = useQueryClient();
  const seen = useRef<{ running: boolean; finished: string | null } | null>(null);
  const running = data?.running ?? null;
  const finished = data?.lastFinishedAt ?? null;
  useEffect(() => {
    if (!data) return;
    const prev = seen.current;
    seen.current = { running: !!running, finished };
    if (prev && ((prev.running && !running) || (finished !== null && finished !== prev.finished))) {
      [keys.needsCompany, keys.counts, keys.inquiries].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    }
  }, [data, running, finished, qc]);
}

/** The refresh alone, for pages that show no bar (Inquiries). */
export function ScrapeRefresh() {
  const { data } = useQuery(scrapeStatusQuery);
  useScrapeRefresh(data);
  return null;
}
