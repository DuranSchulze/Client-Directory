"use client";

import { Check } from "lucide-react";
import { Field, fieldProps } from "@/components/shared/field";
import { ENTITIES, type Entity } from "@/lib/enums";
import type { CompanyValues } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import type { FieldDef, FieldGroup } from "./company-fields";

export type CompanyDraft = Partial<CompanyValues>;

function EntityToggles({ id, value, onChange }: { id: string; value: Entity[]; onChange: (v: Entity[]) => void }) {
  return (
    <div id={id} role="group" aria-label="Intercompany" className="flex flex-wrap gap-1.5">
      {ENTITIES.map((e) => {
        const on = value.includes(e);
        return (
          <button key={e} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== e) : [...value, e])}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
              on ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-primary-text" : "bg-sunk text-muted-foreground hover:bg-lift hover:text-foreground dark:bg-field")}>
            {on && <Check aria-hidden className="size-3.5" />}{e}
          </button>
        );
      })}
    </div>
  );
}

export function CompanyInput({ def, draft, setDraft, error, idPrefix }: {
  def: FieldDef; draft: CompanyDraft; setDraft: (patch: CompanyDraft) => void; error?: string; idPrefix: string;
}) {
  const id = `${idPrefix}-${def.key}`;
  const raw = draft[def.key];
  const str = typeof raw === "string" ? raw : "";
  const set = (v: unknown) => setDraft({ [def.key]: v } as CompanyDraft);
  let control: React.ReactNode;
  switch (def.kind) {
    case "entities":
      control = <EntityToggles id={id} value={(raw as Entity[] | undefined) ?? []} onChange={set} />;
      break;
    case "bool":
      control = (
        <select {...fieldProps(id, error)} value={raw ? "yes" : "no"} onChange={(e) => set(e.target.value === "yes")} className="field-select h-9 w-full bg-sunk dark:bg-field">
          <option value="no">No</option><option value="yes">Yes</option>
        </select>
      );
      break;
    case "select":
      control = (
        <select {...fieldProps(id, error)} value={str} onChange={(e) => set(e.target.value || null)} className="field-select h-9 w-full bg-sunk dark:bg-field">
          {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case "textarea":
      control = <textarea {...fieldProps(id, error)} value={str} onChange={(e) => set(e.target.value)} rows={2} className="field-input h-auto min-h-[4.5rem] resize-y py-2" />;
      break;
    default:
      control = (
        <input {...fieldProps(id, error)} type={def.kind === "date" ? "date" : def.kind === "url" ? "url" : def.kind === "email" ? "email" : "text"}
          value={str} placeholder={def.placeholder} onChange={(e) => set(e.target.value)} className="field-input" />
      );
  }
  return <Field id={id} label={def.label} error={error} hint={def.hint} className={cn(def.full && "sm:col-span-2")}>{control}</Field>;
}

export function CompanyGroups({ groups, draft, setDraft, errors, idPrefix }: {
  groups: FieldGroup[]; draft: CompanyDraft; setDraft: (patch: CompanyDraft) => void; errors: Partial<Record<string, string>>; idPrefix: string;
}) {
  return (
    <>
      {groups.map((g) => (
        <fieldset key={g.title} className="rounded-xl bg-sunk p-4 dark:bg-accent/60">
          <legend className="float-left mb-3 w-full text-[13px] font-semibold text-muted-foreground">{g.title}</legend>
          <div className="clear-both grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => <CompanyInput key={f.key} def={f} draft={draft} setDraft={setDraft} error={errors[f.key]} idPrefix={idPrefix} />)}
          </div>
        </fieldset>
      ))}
    </>
  );
}

/** Builds the PATCH body: only changed keys, blank strings sent as null. */
export function diffDraft(original: CompanyValues, draft: CompanyDraft): Partial<CompanyValues> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    const norm = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
    const before = original[k as keyof CompanyValues];
    if (JSON.stringify(norm) !== JSON.stringify(before ?? null)) out[k] = norm;
  }
  return out as Partial<CompanyValues>;
}
