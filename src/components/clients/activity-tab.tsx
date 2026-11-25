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
      <div role="tablist" aria-label="Activity views" className="mb-3 flex gap-1 rounded-full bg-sunk p-1 dark:bg-accent/60">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" type="button" aria-selected={view === v.id} onClick={() => setView(v.id)}
            className={cn("flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap outline-none transition-[background-color,transform] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
              view === v.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground")}>{v.label}</button>
        ))}
      </div>
      {view === "conversations" && <>
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-sunk p-4 text-sm sm:grid-cols-4 dark:bg-accent/60">
          <div><dt className="text-xs text-muted-foreground">Stage</dt><dd className="mt-0.5">{a.summary.stage ? <Pill tone="gold">{STAGE_LABEL[a.summary.stage]}</Pill> : DASH}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Messages</dt><dd className="mt-0.5 font-semibold tabular-nums">{a.summary.messages.toLocaleString()}</dd></div>
          <div><dt className="text-xs text-muted-foreground">First contact</dt><dd className="mt-0.5 tabular-nums">{day(a.summary.firstContact)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Last contact</dt><dd className="mt-0.5 tabular-nums">{day(a.summary.lastContact)}</dd></div>
        </dl>
        <Conversations items={a.timeline.items} truncated={a.timeline.truncated} />
      </>}
      {view === "payments" && <>
      <Section title="Payments">
        {a.payments.length === 0 ? <p className="text-sm text-muted-foreground">No verified payments.</p> : (
          <table className="w-full text-sm">
            <thead className="sr-only"><tr><th>Date</th><th>Basis</th><th>Amount</th></tr></thead>
            <tbody>
              {a.payments.map((p, i) => (
                <tr key={i} className={cn(p.basis !== "stated" && p.basis !== "manual" && "[&>td]:bg-warning/10")}>
                  <td className="rounded-l-md py-1.5 pl-1 text-muted-foreground tabular-nums">{day(p.date)}</td>
                  <td className="py-1.5"><Pill tone={BASIS[p.basis].tone}>{BASIS[p.basis].label}</Pill></td>
                  <td className="rounded-r-md py-1.5 pr-1 text-right font-semibold tabular-nums">{money(p)}</td>
                </tr>
              ))}
              {totals.map((t, i) => (
                <tr key={t.currency ?? "unknown"}>
                  <td colSpan={2} className={cn("font-semibold", i === 0 && "pt-3")}>{totals.length > 1 ? `Total ${t.currency ?? "(currency unknown)"}` : "Total"}</td>
                  <td className={cn("pr-1 text-right font-bold tabular-nums", i === 0 && "pt-3")}>{money({ amount: t.amount, currency: t.currency })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Quotes & invoices">
        {a.amounts.length === 0 ? <p className="text-sm text-muted-foreground">None on record.</p> : (
          <table className="w-full text-sm">
            <thead className="sr-only"><tr><th>Type</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {a.amounts.map((x, i) => (
                <tr key={i}>
                  <td className="py-1.5"><Pill tone={x.stage === "quoted" ? "info" : "warning"}>{x.stage === "quoted" ? "Quote" : "Invoice"}</Pill></td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{money(x)}</td>
                  <td className="py-1.5 pl-3 text-right text-muted-foreground tabular-nums">{day(x.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      </>}
      {view === "stages" && <StageTally items={a.timeline.items} current={a.stage} />}
      <p className="mt-1 mb-0 flex items-center gap-2 text-xs text-muted-foreground"><Lock aria-hidden className="size-3.5" />Read-only. Includes conversations not yet reviewed in the Scraper.</p>
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
    <section className="mb-3 rounded-xl bg-sunk p-4 dark:bg-accent/60">
      <h3 className="mb-1 text-[13px] font-semibold text-muted-foreground">Messages by stage</h3>
      <p className="mb-3 text-xs text-muted-foreground">Clients run several threads at once, so stages overlap in time. Counts cover every conversation.</p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No staged messages.</p> : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.k} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card px-3 py-2.5 text-sm">
              <Pill tone={EVENT[r.k].tone}>{EVENT[r.k].label}</Pill>
              <span className="font-semibold tabular-nums">{r.count}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{r.first === r.last ? day(r.first) : `${day(r.first)} to ${day(r.last)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {current && <p className="mt-3 text-xs text-muted-foreground">Furthest stage reached: <b className="text-foreground">{STAGE_LABEL[current]}</b></p>}
    </section>
  );
}
