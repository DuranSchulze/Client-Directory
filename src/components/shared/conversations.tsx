"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/shared/pills";
import type { TimelineItem } from "@/lib/candidate-types";
import { DASH, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const EVENT: Record<string, { label: string; tone: PillTone }> = {
  inquiry: { label: "Inquiry", tone: "neutral" },
  quoted: { label: "Quote sent", tone: "info" },
  invoiced: { label: "Invoice sent", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  payment_claim: { label: "Client payment message", tone: "success" },
  payment_screenshot: { label: "Client image", tone: "success" },
  payment_confirmed: { label: "Payment confirmed", tone: "success" },
};

const PAGE = 20;
const month = (d: string | null) => (d && Number.isFinite(Date.parse(d)) ? new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "Undated");

/** Newest first, grouped by month. Snippet is "Subject — body"; the subject leads. */
export function Conversations({ items, truncated, title = "Recent conversations" }: { items: TimelineItem[]; truncated: boolean; title?: string }) {
  const [shown, setShown] = useState(PAGE);
  if (items.length === 0) return <p className="rounded-xl bg-sunk p-4 text-sm text-muted-foreground dark:bg-accent/60">No staged messages.</p>;
  const sorted = [...items].reverse().slice(0, shown);
  const groups: { label: string; rows: typeof sorted }[] = [];
  for (const t of sorted) {
    const label = month(t.date);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.rows.push(t); else groups.push({ label, rows: [t] });
  }
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">{title} ({Math.min(shown, items.length)} of {items.length}{truncated ? "; older messages not loaded" : ""})</h3>
      {groups.map((g) => (
        <section key={g.label} className="mb-4">
          <h4 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">{g.label}</h4>
          <ol className="flex flex-col gap-1.5">
            {g.rows.map((t, i) => {
              const ev = EVENT[t.stage] ?? { label: t.stage, tone: "neutral" as PillTone };
              const cut = t.snippet?.indexOf(" — ") ?? -1;
              const subject = t.snippet && cut > 0 ? t.snippet.slice(0, cut).trim() : "";
              const body = t.snippet ? (cut > 0 ? t.snippet.slice(cut + 3) : t.snippet).trim() : "";
              return (
                <li key={`${t.raw_item_id}-${i}`} className="flex gap-3 rounded-xl bg-sunk px-3.5 py-3 dark:bg-accent/60">
                  <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{t.date ? new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : DASH}</span>
                  <div className="min-w-0 flex-1">
                    {subject && <p className="text-[13px] font-semibold break-words">{subject}</p>}
                    {body && <p className={cn("line-clamp-2 text-[13px] break-words", subject ? "mt-0.5 text-muted-foreground" : "text-foreground")}>{body}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Pill tone={ev.tone}>{ev.label}</Pill>
                      {t.amounts.map((m, j) => <span key={j} className="font-semibold text-foreground tabular-nums">{money(m)}</span>)}
                      {[t.department, ...(t.mailboxes ?? [t.mailbox])].filter(Boolean).length > 0 && <span className="min-w-0 break-words">{[t.department, (t.mailboxes ?? [t.mailbox]).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {shown < items.length && <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show older ({items.length - shown})</Button>}
    </div>
  );
}

