"use client";

import { useState } from "react";
import { Mail, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, fieldProps } from "@/components/shared/field";
import { ApiError, request } from "@/lib/api/http";
import { keys } from "@/lib/api/queries";
import { useMutate } from "@/lib/api/use-mutate";
import type { CompanyDetail, ContactInput, ContactItem, ContactResponse, DeleteResponse } from "@/lib/api-types";
import type { BillingRole } from "@/lib/enums";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EMAIL_RE } from "./company-fields";
import { Section } from "./client-sheet";

const ROLE_LABEL: Record<BillingRole, string> = { main: "Main", cc: "CC", none: "Not on billing" };

export function ContactsTab({ detail }: { detail: CompanyDetail }) {
  const id = detail.company.id;
  const [adding, setAdding] = useState(detail.contacts.length === 0);
  const [removing, setRemoving] = useState<ContactItem | null>(null);
  const gmailEmails = new Set(detail.activity.candidates.flatMap((c) => c.fields.emails?.value ?? []).map((e) => e.toLowerCase()));
  const invalidate = [keys.company(id), keys.companies, keys.counts, keys.needsCompany, keys.probity];

  const makeMain = useMutate({
    fn: (c: ContactItem) => request<ContactResponse>(`/api/companies/${id}/contacts/${c.id}`, { method: "PATCH", json: { billingRole: "main" } }),
    invalidate, success: (r) => `${r.item.name ?? r.item.emails[0]} is now the main billing contact`,
  });
  const remove = useMutate({
    fn: (c: ContactItem) => request<DeleteResponse>(`/api/companies/${id}/contacts/${c.id}`, { method: "DELETE" }),
    invalidate, success: "Contact removed", onDone: () => setRemoving(null),
  });

  const sorted = [...detail.contacts].sort((a, b) => (a.billingRole === "main" ? -1 : b.billingRole === "main" ? 1 : 0));
  return (
    <div>
      <Section title={`Contacts · ${detail.contacts.length}`} action={!adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus />Add contact</Button>}>
        {adding && <AddContactForm companyId={id} first={detail.contacts.length === 0} onDone={() => setAdding(false)} />}
        {sorted.length === 0 && !adding && <EmptyState icon={UserRound} title="No contacts on this client." />}
        <ul className="flex flex-col gap-2">
          {sorted.map((c) => {
            const seen = c.emails.some((e) => gmailEmails.has(e.toLowerCase()));
            return (
              <li key={c.id} className="rounded-xl bg-card p-3">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold sm:flex">{initials(c.name ?? c.emails[0])}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.name ?? "Unnamed contact"}</span>
                      <span className={cn("rounded-full px-2 py-px text-[11px] font-bold",
                        c.billingRole === "main" ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text" : "bg-accent text-muted-foreground")}>{ROLE_LABEL[c.billingRole]}</span>
                    </div>
                    {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                    <div className="mt-1.5 flex flex-col gap-1 text-sm">
                      {c.emails.map((e) => <a key={e} href={`mailto:${e}`} className="link-draw inline-flex w-fit items-center gap-1.5 break-all"><Mail aria-hidden className="size-3.5 shrink-0" />{e}</a>)}
                      {c.phones.map((p) => <a key={p} href={`tel:${p}`} className="link-draw inline-flex w-fit items-center gap-1.5 tabular-nums"><Phone aria-hidden className="size-3.5 shrink-0" />{p}</a>)}
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <i aria-hidden className={cn("size-1.5 rounded-full", seen ? "bg-info" : "bg-primary")} />{seen ? "Seen in Gmail" : "From the sheet"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.billingRole !== "main" && (
                      <Button size="xs" variant="ghost" onClick={() => makeMain.mutate(c)} disabled={makeMain.isPending} aria-label={`Make ${c.name ?? c.emails[0]} the main contact`}>
                        <Star />Make main
                      </Button>
                    )}
                    <Button size="icon-xs" variant="ghost" className="text-destructive hover:bg-destructive/10" aria-label={`Remove ${c.name ?? c.emails[0]}`} onClick={() => setRemoving(c)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      <ConfirmDialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }} destructive pending={remove.isPending} pendingLabel="Removing…"
        title="Remove this contact?" confirmLabel="Remove contact"
        description={removing ? `${removing.name ?? removing.emails[0]} will no longer be linked to ${detail.company.name}. Gmail conversations from their email will move to Needs company.` : ""}
        onConfirm={() => removing && remove.mutate(removing)} />
    </div>
  );
}

function AddContactForm({ companyId, first, onDone }: { companyId: number; first: boolean; onDone: () => void }) {
  const [d, setD] = useState({ name: "", designation: "", email: "", phone: "", billingRole: (first ? "main" : "cc") as BillingRole });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const add = useMutate({
    fn: (body: ContactInput) => request<ContactResponse>(`/api/companies/${companyId}/contacts`, { json: body }),
    invalidate: [keys.company(companyId), keys.companies, keys.counts, keys.needsCompany, keys.probity],
    success: "Contact added",
    onDone,
    onFail: (e) => {
      if (e instanceof ApiError && (e.status === 409 || e.field)) {
        const f = e.field === "phones" ? "phone" : e.field && ["name", "designation"].includes(e.field) ? e.field : "email";
        setErrors({ [f]: e.message });
        return true;
      }
    },
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!d.email.trim()) errs.email = "Enter an email address.";
    else if (!EMAIL_RE.test(d.email.trim())) errs.email = "Enter a valid email address.";
    if (d.phone && d.phone.replace(/\D/g, "").length < 7) errs.phone = "Enter a full phone number.";
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById(`ct-${Object.keys(errs)[0]}`)?.focus(); return; }
    add.mutate({ name: d.name.trim() || null, designation: d.designation.trim() || null, emails: [d.email.trim().toLowerCase()], phones: d.phone.trim() ? [d.phone.trim()] : [], billingRole: d.billingRole });
  }
  return (
    <form onSubmit={submit} noValidate className="mb-3 grid gap-3 rounded-xl bg-card p-3 sm:grid-cols-2">
      <Field id="ct-name" label="Contact name" error={errors.name}><input {...fieldProps("ct-name", errors.name)} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="field-input" autoFocus /></Field>
      <Field id="ct-designation" label="Designation" error={errors.designation}><input {...fieldProps("ct-designation", errors.designation)} value={d.designation} onChange={(e) => setD({ ...d, designation: e.target.value })} className="field-input" /></Field>
      <Field id="ct-email" label="Email" required error={errors.email}><input {...fieldProps("ct-email", errors.email)} type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className="field-input" /></Field>
      <Field id="ct-phone" label="Contact no." error={errors.phone} hint="Saved in +63 format"><input {...fieldProps("ct-phone", errors.phone)} type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className="field-input" /></Field>
      <Field id="ct-role" label="Billing" className="sm:col-span-2">
        <select id="ct-role" value={d.billingRole} onChange={(e) => setD({ ...d, billingRole: e.target.value as BillingRole })} className="field-select h-9 w-full bg-sunk dark:bg-field">
          <option value="main">Main (replaces the current main)</option><option value="cc">CC</option><option value="none">Not on billing</option>
        </select>
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {!first && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
        <Button type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add contact"}</Button>
      </div>
    </form>
  );
}
