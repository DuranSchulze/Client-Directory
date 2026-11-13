import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Refetch state: blur plus a pulsing scrim over the last-known content. */
export function Loadable({ loading, className, children }: { loading: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative", className)} aria-busy={loading}>
      <div className={cn("transition-[filter] duration-300", loading && "blur-[2px]")}>{children}</div>
      {loading && <div aria-hidden className="absolute inset-0 animate-pulse rounded-lg bg-background/30" />}
    </div>
  );
}

/** Rows of placeholder blocks for the first load. */
export function PlaceholderRows({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-1 p-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-sunk" />)}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-3 flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && <Button size="sm" variant="destructive" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
