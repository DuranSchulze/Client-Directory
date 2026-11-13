"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/loadable";
import { EngagementPill, EntityTag, Pill, STAGE_LABEL } from "@/components/shared/pills";
import { companyQuery } from "@/lib/api/queries";
import { errorMessage } from "@/lib/api/http";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CompanyTab } from "./company-tab";
import { ContactsTab } from "./contacts-tab";
import { ActivityTab } from "./activity-tab";
import { RecordTab } from "./record-tab";

const TABS = ["Company", "Contacts", "Activity", "Record"] as const;
type Tab = (typeof TABS)[number];

export function ClientSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Company");
  const [lastId, setLastId] = useState(id);
  // An open edit form registers here, so closing or switching tabs can ask before throwing changes away.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  if (id !== lastId) { setLastId(id); setTab("Company"); setDirty(false); }

  const { data, isPending, error, refetch } = useQuery({ ...companyQuery(id ?? 0), enabled: id !== null });
  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());

  const c = data?.company;
  return (
    <Sheet open={id !== null} onOpenChange={(open) => { if (!open) guard(onClose); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-0 bg-card p-0 data-[side=right]:w-full sm:max-w-[600px] data-[side=right]:sm:max-w-[600px]">
        <div className="flex items-start gap-4 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">{initials(c?.name)}</span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-xl leading-snug font-bold tracking-tight text-balance sm:text-2xl">{c?.name ?? (isPending ? "Loading client…" : "Client")}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
              {c ? [c.alias, c.type, `${data!.contacts.length} contact${data!.contacts.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ") : " "}
            </SheetDescription>
            {c && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <EngagementPill engagement={c.engagement} isNew={c.isNew} />
                {data!.probity.length > 0 && <Pill tone="info">Probity</Pill>}
                {data!.activity.stage && <Pill tone="neutral">Gmail · {STAGE_LABEL[data!.activity.stage]}</Pill>}
                {c.entities.map((e) => <EntityTag key={e}>{e}</EntityTag>)}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close client" onClick={() => guard(onClose)}><X className="size-5" /></Button>
        </div>
        <div role="tablist" aria-label="Client sections" className="sticky top-0 z-10 flex gap-1 overflow-x-auto bg-card px-5 py-2 sm:px-6">
          {(c ? TABS : TABS.slice(0, 1)).map((t) => (
            <button key={t} role="tab" type="button" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`}
              onClick={() => { if (t !== tab) guard(() => { setDirty(false); setTab(t); }); }}
              className={cn("rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-lift hover:text-foreground")}>
              {t}{t === "Contacts" && data ? <span className="ml-1.5 text-xs opacity-70 tabular-nums">{data.contacts.length}</span> : null}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto px-5 pt-2 pb-8 sm:px-6">
          {error ? <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
            : !data ? <div role="status" aria-label="Loading" className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-sunk" />)}</div>
            : tab === "Company" ? <CompanyTab detail={data} onDirty={setDirty} onOpenContacts={() => setTab("Contacts")} />
            : tab === "Contacts" ? <ContactsTab detail={data} />
            : tab === "Activity" ? <ActivityTab activity={data.activity} />
            : <RecordTab detail={data} />}
        </div>
      </SheetContent>
      <ConfirmDialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }} title="Discard your changes?"
        description="The edits on this client are not saved yet." confirmLabel="Discard changes" destructive
        onConfirm={() => { setDirty(false); const run = pending; setPending(null); run?.(); }} />
    </Sheet>
  );
}

/** Tonal section block used across the sheet tabs. */
export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-3 rounded-xl bg-sunk p-4 dark:bg-accent/60", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
