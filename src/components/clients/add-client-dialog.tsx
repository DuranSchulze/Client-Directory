"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldProps } from "@/components/shared/field";
import { ApiError, request } from "@/lib/api/http";
import { keys } from "@/lib/api/queries";
import { useMutate } from "@/lib/api/use-mutate";
import type { CompanyResponse, CreateCompanyBody } from "@/lib/api-types";
import { CompanyGroups, type CompanyDraft } from "./company-form";
import { EMAIL_RE, GROUPS, validateCompanyDraft } from "./company-fields";

export type ClientPrefill = { name?: string; email?: string; contactName?: string };

export function AddClientDialog({ open, onOpenChange, onCreated, prefill }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void; prefill?: ClientPrefill;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        {/* Remounts on each open, so a cancelled draft never leaks into the next one. */}
        {open && <AddClientForm prefill={prefill} onCancel={() => onOpenChange(false)} onCreated={(id) => { onOpenChange(false); onCreated(id); }} />}
      </DialogContent>
    </Dialog>
  );
}

function AddClientForm({ prefill, onCancel, onCreated }: { prefill?: ClientPrefill; onCancel: () => void; onCreated: (id: number) => void }) {
  const [draft, setDraftState] = useState<CompanyDraft>({ name: prefill?.name ?? "", type: "Non-individual", entities: [], isNew: true, engagement: null });
  const [contact, setContact] = useState({ name: prefill?.contactName ?? "", designation: "", email: prefill?.email ?? "", phone: "" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [more, setMore] = useState(false);
  const setDraft = (p: CompanyDraft) => setDraftState((d) => ({ ...d, ...p }));

  const create = useMutate({
    fn: (body: CreateCompanyBody) => request<CompanyResponse>("/api/companies", { json: body }),
    invalidate: [keys.companies, keys.counts, keys.probity, keys.needsCompany],
    success: (r) => `${r.item.name} added`,
    onDone: (r) => onCreated(r.item.id),
    onFail: (e) => {
      if (!(e instanceof ApiError)) return;
      const f = e.field === "emails" || /email/i.test(e.message) ? "email" : e.field === "phones" ? "phone" : e.field ?? (e.status === 409 ? "name" : undefined);
      if (!f) return;
      setErrors({ [f]: e.message });
      if (!["name", "email", "phone", "contactName", "designation"].includes(f)) setMore(true);
      return true;
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = validateCompanyDraft(draft) as Record<string, string>;
    if (!contact.email.trim()) errs.email = "A new client needs at least one contact email.";
    else if (!EMAIL_RE.test(contact.email.trim())) errs.email = "Enter a valid email address.";
    if (contact.phone && contact.phone.replace(/\D/g, "").length < 7) errs.phone = "Enter a full phone number.";
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      if (!["name", "email", "phone"].includes(first)) setMore(true);
      setTimeout(() => document.getElementById(`new-${first}`)?.focus(), 0);
      return;
    }
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) as unknown as CreateCompanyBody;
    create.mutate({
      ...clean, name: draft.name!.trim(),
      contacts: [{ name: contact.name.trim() || null, designation: contact.designation.trim() || null, emails: [contact.email.trim().toLowerCase()], phones: contact.phone.trim() ? [contact.phone.trim()] : [], billingRole: "main" }],
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader className="px-5 pt-5 pb-3">
        <DialogTitle className="text-lg font-bold">Add client</DialogTitle>
        <DialogDescription>Registered name and one billing email are required. Everything else can be filled in later.</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-4">
        <div className="grid gap-3 rounded-xl bg-sunk p-4 sm:grid-cols-2 dark:bg-accent/60">
          <Field id="new-name" label="Registered name" required error={errors.name} className="sm:col-span-2">
            <input {...fieldProps("new-name", errors.name)} value={draft.name ?? ""} onChange={(e) => setDraft({ name: e.target.value })} className="field-input" autoFocus />
          </Field>
          <p className="text-[13px] font-semibold text-muted-foreground sm:col-span-2">Main billing contact</p>
          <Field id="new-email" label="Email" required error={errors.email}>
            <input {...fieldProps("new-email", errors.email)} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className="field-input" />
          </Field>
          <Field id="new-contactName" label="Contact name">
            <input id="new-contactName" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className="field-input" />
          </Field>
          <Field id="new-designation" label="Designation">
            <input id="new-designation" value={contact.designation} onChange={(e) => setContact({ ...contact, designation: e.target.value })} className="field-input" />
          </Field>
          <Field id="new-phone" label="Contact no." error={errors.phone}>
            <input {...fieldProps("new-phone", errors.phone)} type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="field-input" />
          </Field>
        </div>
        <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)}
          className="flex items-center gap-1.5 self-start rounded-md px-1 text-sm font-semibold text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight aria-hidden className={`size-4 transition-transform ${more ? "rotate-90" : ""}`} />More details (engagement, BIR & SEC, billing, documents)
        </button>
        {more && <CompanyGroups groups={GROUPS.filter((g) => g.title !== "Payroll / AP")} draft={draft} setDraft={setDraft} errors={errors} idPrefix="new" />}
      </div>
      <DialogFooter className="mx-0 mb-0 rounded-b-xl px-5 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create client"}</Button>
      </DialogFooter>
    </form>
  );
}
