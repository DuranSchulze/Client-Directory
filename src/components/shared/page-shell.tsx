import { cn } from "@/lib/utils";

/** Page wrapper every route uses, so headers and content start and end at the same edges. `narrow` caps form-style pages. */
export function PageShell({ narrow, className, children }: { narrow?: boolean; className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-6", narrow && "max-w-3xl", className)}>{children}</div>;
}
