"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { Field, fieldProps } from "./field";

export type RecordField = {
  key: string; label: string; required?: boolean; full?: boolean; hint?: string;
  kind?: "text" | "date" | "url" | "textarea" | "select" | "list";
  options?: { value: string; label: string }[];
};
export type RecordValues = Record<string, string>;

/** Small create/edit dialog for the secondary lists. "list" fields take comma- or line-separated values. */
export function RecordDialog({ open, onOpenChange, title, description, fields, initial, submitLabel, onSubmit, validate }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; fields: RecordField[];
  initial: RecordValues; submitLabel: string; onSubmit: (v: RecordValues) => Promise<unknown>;
  validate?: (v: RecordValues) => Partial<Record<string, string>>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
        {open && <RecordForm {...{ title, description, fields, initial, submitLabel, onSubmit, validate }} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({ title, description, fields, initial, submitLabel, onSubmit, validate, onClose }: {
  title: string; description?: string; fields: RecordField[]; initial: RecordValues; submitLabel: string;
  onSubmit: (v: RecordValues) => Promise<unknown>; validate?: (v: RecordValues) => Partial<Record<string, string>>; onClose: () => void;
}) {
  const [v, setV] = useState<RecordValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<string, string>> = {};
    for (const f of fields) if (f.required && !v[f.key]?.trim()) errs[f.key] = `Enter ${f.label.toLowerCase()}.`;
    Object.assign(errs, validate?.(v));
    setErrors(errs);
    const first = Object.keys(errs).find((k) => errs[k]);
    if (first) { document.getElementById(`rec-${first}`)?.focus(); return; }
    setPending(true);
    try { await onSubmit(v); onClose(); }
    catch (err) {
      if (err instanceof ApiError && err.field && fields.some((f) => f.key === err.field)) setErrors({ [err.field]: err.message });
      else setErrors({ _form: err instanceof Error ? err.message : "Could not save." });
    } finally { setPending(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader className="px-5 pt-5 pb-3">
        <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid min-h-0 gap-3 overflow-y-auto px-5 pb-4 sm:grid-cols-2">
        {fields.map((f, i) => {
          const id = `rec-${f.key}`;
          const common = { ...fieldProps(id, errors[f.key]), value: v[f.key] ?? "", autoFocus: i === 0 };
          const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [f.key]: e.target.value }));
          return (
            <Field key={f.key} id={id} label={f.label} required={f.required} error={errors[f.key]} hint={f.hint ?? (f.kind === "list" ? "Separate several with commas or new lines" : undefined)}
              className={cn((f.full || f.kind === "textarea" || f.kind === "list") && "sm:col-span-2")}>
              {f.kind === "textarea" || f.kind === "list"
                ? <textarea {...common} onChange={onChange} rows={f.kind === "list" ? 2 : 3} className="field-input h-auto resize-y py-2" />
                : f.kind === "select"
                  ? <select {...common} onChange={onChange} className="field-select h-9 w-full bg-sunk dark:bg-field">{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input {...common} onChange={onChange} type={f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"} className="field-input" />}
            </Field>
          );
        })}
        {errors._form && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{errors._form}</p>}
      </div>
      <DialogFooter className="mx-0 mb-0 rounded-b-xl px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export const listOf = (s: string | undefined) => (s ?? "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
export const textOrNull = (s: string | undefined) => (s?.trim() ? s.trim() : null);
