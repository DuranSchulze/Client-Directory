"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill, type PillTone } from "@/components/shared/pills";
import type { TimelineItem } from "@/lib/candidate-types";
import { DASH, money, stamp } from "@/lib/format";
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
// Scraper stores the first 200 characters of each message (Scraper merge.py).
const SNIPPET_CAP = 200;
// Snippet is "Subject — body", trimmed by the Scraper, so an empty half leaves a bare separator at an end.
export const split = (t: Pick<TimelineItem, "snippet">) => {
  const s = t.snippet ?? "";
  // Strip only the separator; the body keeps its stored whitespace.
  if (/^—(?:\s|$)/.test(s)) return { subject: "", body: s.slice(2).trimEnd() };
  const cut = s.indexOf(" — ");
  if (cut <= 0 && /\s—$/.test(s)) return { subject: s.slice(0, -1).trim(), body: "" };
  return { subject: cut > 0 ? s.slice(0, cut).trim() : "", body: (cut > 0 ? s.slice(cut + 3) : s).trimEnd() };
};
const mailboxesOf = (t: TimelineItem) => (t.mailboxes ?? [t.mailbox]).filter(Boolean);
const month = (d: string | null) => (d && Number.isFinite(Date.parse(d)) ? new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" }) : "Undated");

function ConversationDetail({ t }: { t: TimelineItem }) {
  const { subject, body } = split(t);
  const ev = EVENT[t.stage] ?? { label: t.stage, tone: "neutral" as PillTone };
  const when = stamp(t.date);
  const boxes = mailboxesOf(t);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="break-words pr-6">{subject || "No subject"}</DialogTitle>
        <DialogDescription className="tabular-nums">{when}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={ev.tone}>{ev.label}</Pill>
        {t.amounts.map((m, j) => <span key={j} className="font-semibold tabular-nums">{money(m)}</span>)}
      </div>
      <p className="rounded-xl bg-sunk p-4 text-sm leading-relaxed whitespace-pre-wrap break-words dark:bg-accent/60">{body || DASH}</p>
      {(t.snippet?.length ?? 0) >= SNIPPET_CAP && <p className="text-xs text-muted-foreground">Preview only. The Scraper stores the first {SNIPPET_CAP} characters of each message.</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Department</dt><dd className="min-w-0 break-words">{t.department || DASH}</dd>
        <dt className="text-muted-foreground">{boxes.length > 1 ? "Mailboxes" : "Mailbox"}</dt>
        <dd className="min-w-0">{boxes.length ? <ul>{boxes.map((b) => <li key={b} className="break-words">{b}</li>)}</ul> : DASH}</dd>
      </dl>
    </div>
  );
}

/** Newest first, grouped by month. Snippet is "Subject — body"; the subject leads. */
export function Conversations({ items, truncated, title = "Recent conversations" }: { items: TimelineItem[]; truncated: boolean; title?: string }) {
  const [shown, setShown] = useState(PAGE);
  // Keep the last item after closing so the dialog doesn't go blank during its exit animation.
  const [open, setOpen] = useState<TimelineItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);
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
              const { subject, body } = split(t);
              return (
                <li key={`${t.raw_item_id}-${i}`}>
                  <button type="button" onClick={() => { setOpen(t); setIsOpen(true); }} aria-haspopup="dialog"
                    className="flex w-full gap-3 rounded-xl bg-sunk px-3.5 py-3 text-left outline-none transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-accent active:translate-y-0 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-accent/60 dark:hover:bg-accent">
                  <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{t.date ? new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : DASH}</span>
                  <div className="min-w-0 flex-1">
                    {subject && <p className="text-[13px] font-semibold break-words">{subject}</p>}
                    {body && <p className={cn("line-clamp-2 text-[13px] break-words", subject ? "mt-0.5 text-muted-foreground" : "text-foreground")}>{body}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Pill tone={ev.tone}>{ev.label}</Pill>
                      {t.amounts.map((m, j) => <span key={j} className="font-semibold text-foreground tabular-nums">{money(m)}</span>)}
                      {[t.department, ...mailboxesOf(t)].filter(Boolean).length > 0 && <span className="min-w-0 break-words">{[t.department, mailboxesOf(t).join(", ")].filter(Boolean).join(" · ")}</span>}
                    </div>
                  </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {shown < items.length && <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show older ({items.length - shown})</Button>}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {open && <ConversationDetail t={open} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

