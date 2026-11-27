"use client";

import { useState } from "react";
import { Inbox, Lock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, STAGE_LABEL, type PillTone } from "@/components/shared/pills";
import type { Activity } from "@/lib/api-types";
import type { PaymentBasis } from "@/lib/candidate-types";
import { DASH, day, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paymentTotals } from "@/lib/ui-helpers";
import { Section } from "./client-sheet";
import { Conversations, EVENT } from "@/components/shared/conversations";

// Same labels and tones as the Scraper's review badges (components/review/badges.tsx).
const BASIS: Record<PaymentBasis, { label: string; tone: PillTone }> = {
  stated: { label: "Stated in payment", tone: "success" },
  invoice: { label: "From invoice; confirm", tone: "warning" },
  unknown: { label: "Amount unknown", tone: "warning" },
  manual: { label: "Entered by reviewer", tone: "neutral" },
};

const VIEWS = [
  { id: "conversations", label: "Conversations" },
  { id: "payments", label: "Payments" },
  { id: "stages", label: "Stages" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function ActivityTab({ activity: a }: { activity: Activity }) {
  const [view, setView] = useState<View>("conversations");
  if (a.candidates.length === 0) {
    return <EmptyState icon={Inbox} title="No Gmail conversations match these contacts."
      description="Scraper conversations appear here, reviewed or not, when one of their emails is on this client's contacts." />;
  }
  const totals = paymentTotals(a.payments);
  return (
    <div>
      <div role="tablist" aria-label="Activity views" className="mb-4 flex gap-1 rounded-full bg-card p-1">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" type="button" aria-selected={view === v.id} onClick={() => setView(v.id)}
            className={cn("flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap outline-none transition-[background-color,transform] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
              view === v.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-lift/60 hover:text-foreground")}>{v.label}</button>
        ))}
      </div>
      {view === "conversations" && <>
        <dl className="mb-4 grid grid-cols-2 gap-4 rounded-2xl bg-card p-4 text-sm sm:grid-cols-4 sm:p-5">
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Stage</dt><dd className="mt-1">{a.summary.stage ? <Pill tone="gold">{STAGE_LABEL[a.summary.stage]}</Pill> : DASH}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Messages</dt><dd className="mt-1 font-semibold tabular-nums">{a.summary.messages.toLocaleString()}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">First contact</dt><dd className="mt-1 tabular-nums">{day(a.summary.firstContact)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Last contact</dt><dd className="mt-1 tabular-nums">{day(a.summary.lastContact)}</dd></div>
        </dl>
        <Conversations items={a.timeline.items} truncated={a.timeline.truncated} cardClassName="bg-card hover:bg-lift" />
      </>}
      {view === "payments" && <>
      <Section title="Payments">
        {a.payments.length === 0 ? <p className="text-sm text-muted-foreground">No verified payments.</p> : (
          <div>
            <ul className="flex flex-col gap-1.5">
              {a.payments.map((p, i) => {
                const needsConfirm = p.basis !== "stated" && p.basis !== "manual";
                return (
                  <li key={i} className={cn("flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm",
                    needsConfirm ? "bg-[color-mix(in_srgb,var(--warning)_10%,var(--sunk))]" : "bg-sunk")}>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">{day(p.date)}</span>
                      <Pill tone={BASIS[p.basis].tone}>{BASIS[p.basis].label}</Pill>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums whitespace-nowrap">{money(p)}</span>
                  </li>
                );
              })}
            </ul>
            {totals.length > 0 && (
              <div className="mt-3 flex flex-col gap-1 px-1 pt-1 text-sm">
                {totals.map((t) => (
                  <div key={t.currency ?? "unknown"} className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted-foreground">{totals.length > 1 ? `Total ${t.currency ?? "(currency unknown)"}` : "Total"}</span>
                    <span className="font-bold tabular-nums whitespace-nowrap">{money({ amount: t.amount, currency: t.currency })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>
      <Section title="Quotes & invoices">
        {a.amounts.length === 0 ? <p className="text-sm text-muted-foreground">None on record.</p> : (
          <ul className="flex flex-col gap-1.5">
            {a.amounts.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-sunk px-3.5 py-2.5 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Pill tone={x.stage === "quoted" ? "info" : "warning"}>{x.stage === "quoted" ? "Quote" : "Invoice"}</Pill>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">{day(x.date)}</span>
                </div>
                <span className="shrink-0 font-semibold tabular-nums whitespace-nowrap">{money(x)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      </>}
      {view === "stages" && <StageTally items={a.timeline.items} current={a.stage} />}
      <p className="mt-3 mb-0 flex items-center gap-2 px-1 text-xs text-muted-foreground"><Lock aria-hidden className="size-3.5 shrink-0" />Read-only. Includes conversations not yet reviewed in the Scraper.</p>
    </div>
  );
}

/** A client has many threads, so stages overlap in time. Count messages per stage, not a sequence. */
function StageTally({ items, current }: { items: Activity["timeline"]["items"]; current: Activity["stage"] }) {
  const rows = Object.keys(EVENT).map((k) => {
    const hits = items.filter((t) => t.stage === k);
    const dates = hits.map((t) => t.date).filter((d): d is string => !!d).sort();
    return { k, count: hits.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
  }).filter((r) => r.count > 0);
  return (
    <Section title="Messages by stage">
      <p className="mb-3 text-xs text-muted-foreground">Clients run several threads at once, so stages overlap in time. Counts cover every conversation.</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No staged messages.</p> : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.k} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sunk px-3.5 py-2.5 text-sm">
              <Pill tone={EVENT[r.k].tone}>{EVENT[r.k].label}</Pill>
              <span className="font-semibold tabular-nums">{r.count}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{r.first === r.last ? day(r.first) : `${day(r.first)} to ${day(r.last)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {current && <p className="mt-3 text-xs text-muted-foreground">Furthest stage reached: <b className="text-foreground">{STAGE_LABEL[current]}</b></p>}
    </Section>
  );
}
