"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Command } from "cmdk";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, CircleCheck, Link2, Plus, SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TableSearch } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, PlaceholderRows } from "@/components/shared/loadable";
import { Pill, STAGE_LABEL } from "@/components/shared/pills";
import { companiesQuery, countsQuery, keys, needsCompanyQuery, type PageParams } from "@/lib/api/queries";
import { usePagedList } from "@/lib/api/use-paged-list";
import { errorMessage, request } from "@/lib/api/http";
import { useMutate } from "@/lib/api/use-mutate";
import type { AttachAllResult, ContactResponse, ItemResponse, NeedsCompanyItem } from "@/lib/api-types";
import { ago, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = [10, 25, 50, 100];

const UNDO_MS = 5000;
const BULK_LIMIT = 5000;

/** Toast with a 5 second Undo that deletes the contacts the attach just created. */
function undoToast(qc: QueryClient, message: string, contacts: { id: number; companyId: number }[]) {
  const refresh = () => Promise.all([keys.needsCompany, keys.counts, keys.companies, keys.probity].map((queryKey) => qc.invalidateQueries({ queryKey })));
  toast.success(message, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        request<ItemResponse<{ removed: number }>>("/api/needs-company/undo", { json: { contacts } })
          .then(() => { toast.success("Attach undone"); return refresh(); })
          .catch((e) => toast.error(errorMessage(e)));
      },
    },
  });
}

export function NeedsCompanyView() {
  // `input` is what the box shows; `view` is what the server is asked for. The search term and the page reset
  // commit in one update, so a half-typed term never requests the old page number.
  const [input, setInput] = useState("");
  const [view, setView] = useState({ q: "", page: 1, size: 25 });
  const [confirm, setConfirm] = useState(false);
  const typed = input.trim();
  useEffect(() => {
    const t = setTimeout(() => setView((v) => (v.q === typed ? v : { ...v, q: typed, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const { q: query, page, size } = view;
  const setPage = (p: number) => setView((v) => ({ ...v, page: p }));
  const clearSearch = () => { setInput(""); setView((v) => ({ ...v, q: "", page: 1 })); };
  // One request per page: the server pages, searches and counts; keepPreviousData keeps the old rows on screen while the next page loads.
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = usePagedList(queuePageQuery, { page: String(page), size: String(size), q: query });
  // Rows from the previous query are still showing, or the search term has not been sent yet.
  const settling = isPlaceholderData || typed !== query;
  const visible = data?.items ?? [];
  const total = data?.total ?? 0;
  const suggested = data?.suggested ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  // An attach can empty the last page; step back to the last page that still exists.
  if (data && !isFetching && !settling && page > pages) setPage(pages);
  const { data: counts } = useQuery(countsQuery);
  // Only the unfiltered page total is the whole queue. The badge is capped at the bulk limit, so it never feeds the unmatched number.
  const wholeQueue = !query && !settling && data ? total : null;
  const unmatched = wholeQueue === null ? null : Math.max(0, wholeQueue - suggested);
  // The bulk action reads the first 5,000 queued contacts. Warn whenever the queue may be longer, including while its size is unknown.
  const mayExceed = wholeQueue !== null ? wholeQueue > BULK_LIMIT : (counts?.needsCompany ?? BULK_LIMIT) >= BULK_LIMIT;
  const qc = useQueryClient();
  const attachAll = useMutate({
    fn: () => request<ItemResponse<AttachAllResult>>("/api/needs-company/attach-all", { method: "POST" }),
    invalidate: [keys.needsCompany, keys.counts, keys.companies, keys.probity],
    onDone: (r) => {
      setConfirm(false);
      // Nothing was created, so there is nothing to undo.
      if (r.item.contacts.length === 0) toast.info("No contacts were attached. Contacts beyond the bulk limit need Attach on their own row.");
      else undoToast(qc, `Attached ${r.item.attached} contact${r.item.attached === 1 ? "" : "s"}`, r.item.contacts);
    },
  });
  return (
    <PageShell>
      <PageHeader title="Needs company" description="Approved Gmail contacts whose email is on no client and no internal mailbox. Attach each to a client so its activity shows there."
        actions={<Button disabled={suggested === 0 || isPending} onClick={() => setConfirm(true)}><Link2 />Attach everything{suggested > 0 && ` (${suggested})`}</Button>} />
      <section aria-label="Unlinked Gmail contacts" className="overflow-hidden rounded-2xl border border-edge bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold text-muted-foreground">Queue</h2>
          <span className="text-sm font-bold text-primary-text tabular-nums">{isPending ? "…" : total}</span>
          <div className="ml-auto w-full sm:w-72">
            <TableSearch value={input} placeholder="Search name, company or email" onChange={setInput} />
          </div>
        </div>
        {error ? <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
          : isPending ? <PlaceholderRows rows={4} />
          : total === 0 && !query ? <EmptyState icon={CircleCheck} title="Every approved Gmail contact belongs to a client." />
          : total === 0 ? <EmptyState icon={SearchX} title="No contact matches that search." actionLabel="Clear search" onAction={clearSearch} />
          : <ul aria-busy={isFetching} className={cn("flex flex-col gap-2 px-2 pb-2 transition-opacity", isFetching && "opacity-60")}>{visible.map((it) => <QueueRow key={it.id} item={it} />)}</ul>}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3 pb-4 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{settling ? "Loading…" : `Showing ${start + 1} to ${Math.min(start + size, total)} of ${total} contacts`}</span>
            <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
              <label className="flex items-center gap-2">Rows
                <select value={size} onChange={(e) => setView((v) => ({ ...v, size: Number(e.target.value), page: 1 }))} className="field-select h-8 bg-sunk dark:bg-field">
                  {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={settling || current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft /></Button>
                <span className="min-w-14 text-center tabular-nums">{current} / {pages}</span>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={settling || current >= pages} onClick={() => setPage(current + 1)}><ChevronRight /></Button>
              </span>
            </div>
          </div>
        )}
      </section>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Attach ${suggested} contact${suggested === 1 ? "" : "s"}?`}
        description={`Each one goes to the client that shares its email domain. ${unmatched !== null && unmatched > 0 ? `${unmatched} with no match stay in the queue. ` : ""}${mayExceed ? `Attach everything only reads the first ${BULK_LIMIT.toLocaleString()} queued contacts, so contacts beyond that need Attach on their own row. ` : ""}You can remove a contact from the client afterwards.`}
        confirmLabel="Attach everything" pendingLabel="Attaching…" pending={attachAll.isPending} onConfirm={() => attachAll.mutate()} />
    </PageShell>
  );
}

const queuePageQuery = (p: PageParams) => needsCompanyQuery(Number(p.page), Number(p.size), p.q ?? "");

function QueueRow({ item }: { item: NeedsCompanyItem }) {
  const router = useRouter();
  const f = item.fields;
  const name = f.name?.value ?? f.emails?.value?.[0] ?? `Candidate #${item.id}`;
  const emails = f.emails?.value ?? [];
  const [target, setTarget] = useState<{ id: number; name: string } | null>(item.suggestion ? { id: item.suggestion.companyId, name: item.suggestion.name } : null);
  const qc = useQueryClient();
  const attach = useMutate({
    fn: (companyId: number) => request<ContactResponse>(`/api/needs-company/${item.id}/attach`, { json: { companyId } }),
    invalidate: [keys.needsCompany, keys.counts, keys.companies, keys.probity],
    onDone: (r) => undoToast(qc, `Attached to ${target?.id === r.item.companyId ? target.name : "client"}`, [{ id: r.item.id, companyId: r.item.companyId }]),
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
        <ClientPicker value={target} onChange={setTarget} disabled={noEmail} label={`Attach ${name} to`} />
        <Button disabled={!target || attach.isPending || noEmail} onClick={() => target && attach.mutate(target.id)} className="max-sm:flex-1">
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

/** Searchable client picker (the list has ~1,500 clients, so a plain select is unusable). The full list loads only when it opens. */
function ClientPicker({ value, onChange, disabled, label }: {
  value: { id: number; name: string } | null; onChange: (v: { id: number; name: string }) => void; disabled?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const list = useQuery({ ...companiesQuery, enabled: wanted });
  const companies = list.data ?? [];
  const selected = value;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setWanted(true); }}>
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
            {list.isPending ? <div role="status" aria-label="Loading clients" className="flex flex-col gap-1 p-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} aria-hidden className="skeleton-sweep h-8 rounded-md" />)}</div>
              : list.error ? <div role="alert" className="flex flex-col items-center gap-2 px-3 py-5 text-center text-sm text-destructive">{errorMessage(list.error)}<Button size="sm" variant="secondary" onClick={() => list.refetch()}>Try again</Button></div>
              : <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No client with that name.</Command.Empty>}
            {companies.map((c) => (
              <Command.Item key={c.id} value={`${c.name} ${c.alias ?? ""} #${c.id}`} onSelect={() => { onChange({ id: c.id, name: c.name }); setOpen(false); }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent">
                <Check aria-hidden className={cn("size-4 shrink-0", c.id === value?.id ? "text-primary-text" : "opacity-0")} />
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
