import { Inbox, Lock, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, STAGE_LABEL, type PillTone } from "@/components/shared/pills";
import type { Activity } from "@/lib/api-types";
import type { PaymentBasis } from "@/lib/candidate-types";
import { STAGES } from "@/lib/enums";
import { DASH, day, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paymentTotals } from "@/lib/ui-helpers";
import { Section } from "./client-sheet";

// Same labels and tones as the Scraper's review badges (components/review/badges.tsx).
const BASIS: Record<PaymentBasis, { label: string; tone: PillTone }> = {
  stated: { label: "Stated in payment", tone: "success" },
  invoice: { label: "From invoice; confirm", tone: "warning" },
  unknown: { label: "Amount unknown", tone: "warning" },
  manual: { label: "Entered by reviewer", tone: "neutral" },
};
const EVENT: Record<string, { label: string; tone: PillTone }> = {
  inquiry: { label: "Inquiry", tone: "neutral" },
  quoted: { label: "Quote sent", tone: "info" },
  invoiced: { label: "Invoice sent", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  payment_claim: { label: "Client payment message", tone: "success" },
  payment_screenshot: { label: "Client image", tone: "success" },
  payment_confirmed: { label: "Payment confirmed", tone: "success" },
};

export function ActivityTab({ activity: a }: { activity: Activity }) {
  if (a.candidates.length === 0) {
    return <EmptyState icon={Inbox} title="No Gmail conversations match these contacts."
      description="Approved Scraper conversations appear here when one of their emails is on this client's contacts." />;
  }
  const reached = a.stage ? STAGES.indexOf(a.stage) : -1;
  const totals = paymentTotals(a.payments);
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Lock aria-hidden className="size-3.5" />Read-only. Gmail data is reviewed and approved in the Scraper.</p>
      {a.needsCheck.map((msg, i) => (
        <p key={i} className="mb-1.5 flex items-start gap-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2.5 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />{msg}
        </p>
      ))}
      <Section title="Engagement pipeline">
        <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s} className={cn("rounded-lg p-2.5 text-xs", i <= reached ? "bg-[color-mix(in_srgb,var(--primary)_20%,var(--card))]" : "bg-card")}>
              <b className="block text-[13px]">{STAGE_LABEL[s]}</b>
              <span className="text-muted-foreground tabular-nums">{a.stageDates[s] ? day(a.stageDates[s]) : DASH}</span>
            </li>
          ))}
        </ol>
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
      <Section title={`Timeline${a.timeline.truncated ? " (latest 200)" : ""}`}>
        {a.timeline.items.length === 0 ? <p className="text-sm text-muted-foreground">No staged messages.</p> : (
          <ol className="relative flex flex-col gap-3 pl-6 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-0.5 before:rounded before:bg-accent">
            {[...a.timeline.items].reverse().map((t, i) => {
              const ev = EVENT[t.stage] ?? { label: t.stage, tone: "neutral" as PillTone };
              const strong = t.stage === "paid" || t.stage === "payment_confirmed";
              return (
                <li key={`${t.raw_item_id}-${i}`} className="relative rounded-xl bg-card px-3.5 py-3">
                  <span aria-hidden className={cn("absolute top-4 -left-[23px] size-2.5 rounded-full", strong ? "bg-primary" : "bg-muted-foreground")} />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{day(t.date)}</span><Pill tone={ev.tone}>{ev.label}</Pill>
                    {t.amounts.map((m, j) => <span key={j} className="font-semibold text-foreground tabular-nums">{money(m)}</span>)}
                    <span>{[t.department, t.mailbox].filter(Boolean).join(" · ")}</span>
                  </div>
                  {t.snippet && <p className="mt-1 text-[13px] text-foreground">{t.snippet}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
