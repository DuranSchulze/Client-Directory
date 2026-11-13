import { cn } from "@/lib/utils";
import { STAGES, type Engagement, type Stage } from "@/lib/enums";

// Status is tinted, never filled: 16% colour-mix background plus coloured text.
const TONE = {
  neutral: "bg-accent text-foreground",
  gold: "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text",
  info: "bg-[color-mix(in_srgb,var(--info)_16%,transparent)] text-info",
  success: "bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-success",
  warning: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
  danger: "bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] text-destructive",
  muted: "bg-accent text-muted-foreground",
} as const;
export type PillTone = keyof typeof TONE;

export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

export function EngagementPill({ engagement, isNew }: { engagement: Engagement | null; isNew?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {engagement === "active" && <Pill tone="gold">Active</Pill>}
      {engagement === "inactive" && <Pill tone="muted">Inactive</Pill>}
      {engagement === null && <Pill tone="warning">Not set</Pill>}
      {isNew && <Pill tone="info" className="text-[11px]">New</Pill>}
    </span>
  );
}

export const STAGE_LABEL: Record<Stage, string> = { inquiry: "Inquiry", quoted: "Quoted", invoiced: "Invoiced", paid: "Paid" };

/** Four-step bar for the Gmail stage, with its label. */
export function StageSteps({ stage }: { stage: Stage | null }) {
  const reached = stage ? STAGES.indexOf(stage) : -1;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={stage ? `Gmail stage: ${STAGE_LABEL[stage]}` : "No Gmail activity"}>
      {STAGES.map((s, i) => <i key={s} aria-hidden className={cn("h-1.5 w-[18px] rounded-full", i <= reached ? "bg-primary" : "bg-accent")} />)}
      <span className="ml-2 text-xs text-muted-foreground">{stage ? STAGE_LABEL[stage] : "No Gmail"}</span>
    </span>
  );
}

export function EntityTag({ children }: { children: React.ReactNode }) {
  return <span className="mr-1 mb-1 inline-block rounded-md bg-accent px-1.5 py-px text-[11px] font-bold tracking-wide">{children}</span>;
}
