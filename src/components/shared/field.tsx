import { cn } from "@/lib/utils";

/** Label above the control, hint or error below it. The error is announced and tied to the control by id. */
export function Field({ id, label, required, hint, error, className, children }: {
  id: string; label: string; required?: boolean; hint?: string; error?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Props that wire an input to its Field (aria-invalid + aria-describedby). */
export const fieldProps = (id: string, error?: string) => ({
  id, name: id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined,
});
