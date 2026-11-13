"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, CircleCheck, Link2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, PlaceholderRows } from "@/components/shared/loadable";
import { Pill, STAGE_LABEL } from "@/components/shared/pills";
import { companiesQuery, keys, needsCompanyQuery } from "@/lib/api/queries";
import { errorMessage, request } from "@/lib/api/http";
import { useMutate } from "@/lib/api/use-mutate";
import type { CompanyListItem, ContactResponse, NeedsCompanyItem } from "@/lib/api-types";
import { ago, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NeedsCompanyView() {
  const { data, isPending, error, refetch } = useQuery(needsCompanyQuery);
  const { data: companies } = useQuery(companiesQuery);
  const items = data ?? [];
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <PageHeader title="Needs company" description="Approved Gmail contacts whose email is on no client and no internal mailbox. Attach each to a client so its activity shows there." />
      <section aria-label="Unlinked Gmail contacts" className="overflow-hidden rounded-2xl border border-edge bg-card">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold text-muted-foreground">Queue</h2>
          <span className="text-sm font-bold text-primary-text tabular-nums">{isPending ? "…" : items.length}</span>
        </div>
        {error ? <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
          : isPending ? <PlaceholderRows rows={4} />
          : items.length === 0 ? <EmptyState icon={CircleCheck} title="Every approved Gmail contact belongs to a client." />
          : <ul className="flex flex-col gap-2 px-2 pb-2">{items.map((it) => <QueueRow key={it.id} item={it} companies={companies ?? []} />)}</ul>}
      </section>
    </div>
  );
}

function QueueRow({ item, companies }: { item: NeedsCompanyItem; companies: CompanyListItem[] }) {
  const router = useRouter();
  const f = item.fields;
  const name = f.name?.value ?? f.emails?.value?.[0] ?? `Candidate #${item.id}`;
  const emails = f.emails?.value ?? [];
  const [target, setTarget] = useState<number | null>(item.suggestion?.companyId ?? null);
  const attach = useMutate({
    fn: (companyId: number) => request<ContactResponse>(`/api/needs-company/${item.id}/attach`, { json: { companyId } }),
    invalidate: [keys.needsCompany, keys.counts, keys.companies],
    success: () => `Attached to ${companies.find((c) => c.id === target)?.name ?? "client"}`,
  });
  const noEmail = emails.length === 0;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-sunk p-3 dark:bg-accent/60">
      <span aria-hidden className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold sm:flex">{initials(name)}</span>
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="flex flex-wrap items-center gap-2 font-semibold">{name}
          {f.stage?.value && <Pill tone="neutral" className="text-[11px]">{STAGE_LABEL[f.stage.value]}</Pill>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{[emails.join(", "), f.company?.value, f.last_contact?.value && `last contact ${ago(f.last_contact.value)}`].filter(Boolean).join(" · ") || "No email on this candidate"}</p>
        {item.suggestion && <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary-text"><Sparkles aria-hidden className="size-3" />Same email domain as {item.suggestion.name}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <ClientPicker companies={companies} value={target} onChange={setTarget} disabled={noEmail} label={`Attach ${name} to`} />
        <Button disabled={!target || attach.isPending || noEmail} onClick={() => target && attach.mutate(target)} className="max-sm:flex-1">
          <Link2 />{attach.isPending ? "Attaching…" : "Attach"}
        </Button>
        <Button variant="secondary" className="max-sm:flex-1"
          onClick={() => router.push(`/clients?new=1${f.company?.value ? `&name=${encodeURIComponent(f.company.value)}` : ""}${emails[0] ? `&email=${encodeURIComponent(emails[0])}` : ""}${f.name?.value ? `&contact=${encodeURIComponent(f.name.value)}` : ""}`)}>
          <Plus />New client
        </Button>
      </div>
    </li>
  );
}

/** Searchable client picker (the list has ~1,500 clients, so a plain select is unusable). */
function ClientPicker({ companies, value, onChange, disabled, label }: {
  companies: CompanyListItem[]; value: number | null; onChange: (id: number) => void; disabled?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => companies.find((c) => c.id === value), [companies, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} aria-label={label}
        className="inline-flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg bg-card px-3 text-sm outline-none transition-colors hover:bg-lift focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-64">
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name ?? "Attach to…"}</span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command label="Clients" className="flex flex-col"
          filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <Command.Input autoFocus placeholder="Search clients" className="h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No client with that name.</Command.Empty>
            {companies.map((c) => (
              <Command.Item key={c.id} value={`${c.name} ${c.alias ?? ""} #${c.id}`} onSelect={() => { onChange(c.id); setOpen(false); }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent">
                <Check aria-hidden className={cn("size-4 shrink-0", c.id === value ? "text-primary-text" : "opacity-0")} />
                <span className="truncate">{c.name}</span>
                {c.alias && <span className="truncate text-xs text-muted-foreground">{c.alias}</span>}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
