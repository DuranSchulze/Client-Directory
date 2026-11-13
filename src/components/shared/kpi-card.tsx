import { cn } from "@/lib/utils";

const TONE = { good: "text-success", warn: "text-warning", bad: "text-destructive", muted: "text-muted-foreground" } as const;
const DOT = { good: "bg-success", warn: "bg-warning", bad: "bg-destructive", muted: "bg-muted-foreground" } as const;
export type Tone = keyof typeof TONE;

/** KPI card: micro-label with a status dot, large value, required context line. Pressable when onClick is set. */
export function KpiCard({ label, value, sub, tone = "muted", dot = tone, pressed, onClick, loading }: {
  label: string; value: React.ReactNode; sub: string; tone?: Tone; dot?: Tone; pressed?: boolean; onClick?: () => void; loading?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <span aria-hidden className={cn("size-2 rounded-full", DOT[dot])} />{label}
      </span>
      <span className={cn("mt-1.5 block text-2xl leading-tight font-bold tracking-tight tabular-nums sm:text-4xl", loading && "animate-pulse text-muted-foreground")}>{value}</span>
      <span className={cn("mt-1 hidden text-[13px] font-semibold sm:block", TONE[tone])}>{sub}</span>
      {pressed && <span aria-hidden className="absolute inset-x-5 bottom-0 h-[3px] rounded-t-full bg-primary" />}
    </>
  );
  const cls = cn(
    "relative block w-full overflow-hidden rounded-2xl border border-edge bg-card px-4 py-3 text-left sm:px-5 sm:py-4",
    onClick && "lift-hover outline-none hover:bg-lift focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
    pressed && "border-[color-mix(in_srgb,var(--primary)_55%,var(--edge))] bg-accent hover:bg-accent",
  );
  return onClick
    ? <button type="button" aria-pressed={!!pressed} onClick={onClick} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>;
}
