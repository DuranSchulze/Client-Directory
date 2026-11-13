"use client";

import { useEffect, useState } from "react";
import { Eye, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, fieldProps } from "@/components/shared/field";
import { request, ApiError } from "@/lib/api/http";
import { keys } from "@/lib/api/queries";
import { useMutate } from "@/lib/api/use-mutate";
import type { CompanyDetail, CompanyItem, CompanyResponse, CompanyValues, RevealAccountResponse } from "@/lib/api-types";
import { DASH, day, orDash } from "@/lib/format";
import { CompanyGroups, diffDraft, type CompanyDraft } from "./company-form";
import { GROUPS, validateCompanyDraft, type FieldDef } from "./company-fields";
import { Section } from "./client-sheet";
import { toast } from "sonner";
import { revealSecondsLeft } from "@/lib/ui-helpers";

const toDraft = (c: CompanyItem): CompanyDraft => {
  const d: Record<string, unknown> = {};
  for (const g of GROUPS) for (const f of g.fields) d[f.key] = c[f.key];
  d.name = c.name;
  return d as CompanyDraft;
};

function display(def: FieldDef, c: CompanyItem): React.ReactNode {
  const v = c[def.key];
  if (def.kind === "entities") return (v as string[]).length ? (v as string[]).join(", ") : DASH;
  if (def.kind === "bool") return v ? "Yes" : "No";
  if (def.kind === "date") return day(v as string | null);
  if (def.key === "engagement") return v === "active" ? "Active" : v === "inactive" ? "Inactive" : "Not set";
  if (def.kind === "url" && v) return <a href={v as string} target="_blank" rel="noreferrer" className="link-draw break-all">Open folder</a>;
  return orDash(v as string | null);
}

export function CompanyTab({ detail, onDirty, onOpenContacts }: { detail: CompanyDetail; onDirty: (dirty: boolean) => void; onOpenContacts: () => void }) {
  const c = detail.company;
  const [editing, setEditing] = useState(false);
  const [draft, setDraftState] = useState<CompanyDraft>(() => toDraft(c));
  const [accountNo, setAccountNo] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const setDraft = (patch: CompanyDraft) => { setDraftState((d) => ({ ...d, ...patch })); onDirty(true); };

  const save = useMutate({
    fn: (body: Partial<CompanyValues> & { accountNo?: string }) => request<CompanyResponse>(`/api/companies/${c.id}`, { method: "PATCH", json: body }),
    invalidate: [keys.company(c.id), keys.companies, keys.counts, keys.probity],
    success: "Client saved",
    onDone: () => { setEditing(false); onDirty(false); setAccountNo(""); },
    onFail: (e) => { if (e instanceof ApiError && e.field) { setErrors({ [e.field]: e.message }); return true; } },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Only changed fields are checked: imported values the admin did not touch (an SI email list, say) never block an unrelated edit.
    const body: Partial<CompanyValues> & { accountNo?: string } = diffDraft(c, draft);
    const errs = validateCompanyDraft({ ...body, name: draft.name ?? "" });
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById(`edit-${Object.keys(errs)[0]}`)?.focus(); return; }
    if (accountNo.trim()) body.accountNo = accountNo.trim();
    if (!Object.keys(body).length) { setEditing(false); onDirty(false); return; }
    save.mutate(body);
  }

  if (editing) {
    return (
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="rounded-xl bg-sunk p-4 dark:bg-accent/60">
          <Field id="edit-name" label="Registered name" required error={errors.name}>
            <input {...fieldProps("edit-name", errors.name)} value={draft.name ?? ""} onChange={(e) => setDraft({ name: e.target.value })} className="field-input" />
          </Field>
        </div>
        <CompanyGroups groups={GROUPS} draft={draft} setDraft={setDraft} errors={errors} idPrefix="edit" />
        <div className="rounded-xl bg-sunk p-4 dark:bg-accent/60">
          <Field id="edit-accountNo" label="Bank account no." error={errors.accountNo}
            hint={c.accountNoLast4 ? `Stored encrypted as •••• ${c.accountNoLast4}. Leave blank to keep it.` : "Stored encrypted; shown masked everywhere."}>
            <input {...fieldProps("edit-accountNo", errors.accountNo)} value={accountNo} autoComplete="off" inputMode="numeric"
              onChange={(e) => { setAccountNo(e.target.value); onDirty(true); }} className="field-input" />
          </Field>
        </div>
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-card px-1 pt-3">
          <Button type="button" variant="ghost" onClick={() => { setEditing(false); setErrors({}); setDraftState(toDraft(c)); setAccountNo(""); onDirty(false); }}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    );
  }

  const probity = detail.probity[0];
  return (
    <div>
      {detail.activity.needsCheck.map((msg, i) => (
        <p key={i} className="mb-1.5 flex items-start gap-2.5 rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2.5 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />{msg}
        </p>
      ))}
      {probity && (
        <Section title="Probity" action={<Button variant="link" size="sm" nativeButton={false} render={<a href="/probity" />}>Open list</Button>}>
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Reference</dt><dd>{orDash(probity.referenceNo)}</dd>
            <dt className="text-muted-foreground">Drafted</dt><dd>{day(probity.draftedOn)}</dd>
            <dt className="text-muted-foreground">Agreement</dt>
            <dd>{probity.agreementUrl ? <a href={probity.agreementUrl} target="_blank" rel="noreferrer" className="link-draw">Signed copy</a> : <span className="font-semibold text-destructive">Missing</span>}</dd>
            <dt className="text-muted-foreground">Remarks</dt><dd>{orDash(probity.remarks)}</dd>
          </dl>
        </Section>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Client details</h3>
        <Button variant="secondary" size="sm" onClick={() => { setDraftState(toDraft(c)); setEditing(true); }}><Pencil />Edit</Button>
      </div>
      {GROUPS.filter((g) => !g.showWhen || g.showWhen(c)).map((g) => (
        <Section key={g.title} title={g.title}>
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
            {g.fields.map((f) => [
              <dt key={`${f.key}-t`} className="text-muted-foreground">{f.label}</dt>,
              <dd key={`${f.key}-d`} className="min-w-0 break-words">{display(f, c)}</dd>,
            ])}
            {g.title === "Payroll / AP" && <AccountRow companyId={c.id} last4={c.accountNoLast4} />}
          </dl>
        </Section>
      ))}
      {detail.contacts.length === 0 && (
        <p className="text-sm text-muted-foreground">No contacts yet. <button type="button" onClick={onOpenContacts} className="link-draw font-semibold">Add one</button></p>
      )}
    </div>
  );
}

const REVEAL_SECONDS = 30;

function AccountRow({ companyId, last4 }: { companyId: number; last4: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  // Timed from an absolute expiry, so a suspended or throttled tab still masks on time; hiding the page masks at once.
  useEffect(() => {
    if (!shown) return;
    const tick = () => {
      const s = revealSecondsLeft(expiresAt);
      if (s === 0 || document.visibilityState === "hidden") { setShown(null); setLeft(0); } else setLeft(s);
    };
    const t = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [shown, expiresAt]);

  async function reveal() {
    setBusy(true);
    try {
      const r = await request<RevealAccountResponse>(`/api/companies/${companyId}/reveal-account`, { method: "POST" });
      if (r.item.accountNo) { setExpiresAt(Date.now() + REVEAL_SECONDS * 1000); setShown(r.item.accountNo); setLeft(REVEAL_SECONDS); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reveal the account number.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <dt className="text-muted-foreground">Account no.</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {!last4 ? DASH : shown
          ? <><span className="font-mono tabular-nums" aria-live="polite">{shown}</span><span className="text-xs text-muted-foreground tabular-nums">hides in {left}s</span>
              <Button variant="ghost" size="xs" onClick={() => setShown(null)}>Hide</Button></>
          : <><span className="font-mono tabular-nums">•••• {last4}</span>
              <Button variant="secondary" size="xs" onClick={reveal} disabled={busy}><Eye />{busy ? "Revealing…" : "Reveal"}</Button></>}
      </dd>
    </>
  );
}
