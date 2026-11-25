"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageSquareText, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Conversations } from "@/components/shared/conversations";
import { ErrorState, PlaceholderRows } from "@/components/shared/loadable";
import { PageHeader } from "@/components/shared/page-header";
import { LastUpdatedNote } from "@/components/shared/last-updated-note";
import { PageShell } from "@/components/shared/page-shell";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, STAGE_LABEL } from "@/components/shared/pills";
import { errorMessage } from "@/lib/api/http";
import { inquiriesPageQuery, inquiryTimelineQuery } from "@/lib/api/queries";
import { usePagedList, usePagedUrlState } from "@/lib/api/use-paged-list";
import type { Inquiry } from "@/lib/api-types";
import { ago, DASH } from "@/lib/format";

/** The instant the server sorts by: offset-free dates are UTC, impossible dates (2026-02-30) are missing. */
export function contactInstant(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const zoned = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(value) ? `${value.replace(" ", "T")}${value.length === 10 ? "T00:00:00" : ""}Z` : value;
  const t = Date.parse(zoned);
  if (Number.isNaN(t)) return null;
  // JavaScript rolls 2026-02-30 over to March 2; the server rejects it, with or without an offset.
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return new Date(t).toISOString();
}

function LastContact({ value }: { value: string | null | undefined }) {
  const at = contactInstant(value);
  return at ? <time dateTime={at} title={new Date(at).toUTCString()}>{ago(at)}</time> : <>{DASH}</>;
}
function ClientLink({ client }: { client: Inquiry["client"] }) {
  return client
    ? <Link href={`/clients?id=${client.companyId}`} className="link-draw font-semibold text-primary-text [overflow-wrap:anywhere]">{client.name}</Link>
    : <span className="text-muted-foreground">Not a client yet</span>;
}

const SORTS = [
  { value: "last_contact:desc", label: "Newest contact" }, { value: "last_contact:asc", label: "Oldest contact" },
  { value: "name:asc", label: "Name A-Z" }, { value: "name:desc", label: "Name Z-A" },
  { value: "company:asc", label: "Company A-Z" }, { value: "company:desc", label: "Company Z-A" },
  { value: "stage:asc", label: "Stage, first to last" }, { value: "stage:desc", label: "Stage, last to first" },
];

export function InquiriesView() {
  const url = usePagedUrlState("last_contact:desc");
  const { data, isPending, isPlaceholderData, error, refetch } = usePagedList(inquiriesPageQuery, url.params);
  const rows = data?.items ?? [];
  const [open, setOpen] = useState<Inquiry | null>(null);
  const sortValue = url.sort ? `${url.sort.key}:${url.sort.dir}` : "last_contact:desc";

  const columns: Column<Inquiry>[] = [
    { key: "name", header: "Inquirer", sortValue: (i) => i.fields.name?.value ?? "", className: "md:min-w-[14rem]", render: (i) => {
      const emails = (i.fields.emails?.value ?? []).filter((e): e is string => typeof e === "string");
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-semibold [overflow-wrap:anywhere]">
            {i.fields.name?.value ?? <span className="font-normal text-muted-foreground">No name</span>}
          </span>
          {emails.map((e) => <a key={e} href={`mailto:${e}`} className="link-draw w-fit break-all text-xs text-muted-foreground">{e}</a>)}
          {/* Phone width: the other columns stack here. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:hidden">
            {i.fields.company?.value && <span className="min-w-0 [overflow-wrap:anywhere]">{i.fields.company.value}</span>}
            {i.fields.stage?.value && <Pill tone="neutral" className="text-[11px]">{STAGE_LABEL[i.fields.stage.value]}</Pill>}
            <span className="text-muted-foreground">Last contact <LastContact value={i.fields.last_contact?.value} /></span>
            <ClientLink client={i.client} />
          </div>
          <InboxButton className="mt-1.5 md:hidden" onOpen={() => setOpen(i)} name={i.fields.name?.value} />
        </div>
      );
    } },
    { key: "company", header: "Company", desktopOnly: true, sortValue: (i) => i.fields.company?.value ?? "", render: (i) => <span className="[overflow-wrap:anywhere]">{i.fields.company?.value ?? DASH}</span> },
    { key: "stage", header: "Stage", desktopOnly: true, sortValue: (i) => i.fields.stage?.value ?? "", render: (i) => i.fields.stage?.value ? <Pill tone="neutral">{STAGE_LABEL[i.fields.stage.value]}</Pill> : DASH },
    { key: "department", header: "Department", wideOnly: true, className: "text-muted-foreground", render: (i) => i.fields.department?.value ?? DASH },
    { key: "last_contact", header: "Last contact", desktopOnly: true, sortValue: (i) => i.fields.last_contact?.value ?? "", className: "whitespace-nowrap tabular-nums", render: (i) => <LastContact value={i.fields.last_contact?.value} /> },
    { key: "client", header: "Client", desktopOnly: true, render: (i) => <ClientLink client={i.client} /> },
    { key: "inbox", header: "Inbox", desktopOnly: true, render: (i) => <InboxButton onOpen={() => setOpen(i)} name={i.fields.name?.value} /> },
  ];

  return (
    <PageShell>
      <PageHeader note={<LastUpdatedNote source="scraper" />} title="Inquiries" description="Everyone the Scraper marked as an inquiry, newest contact first. A client name opens that client." />
      <DataTableCard title="Inquiries" rows={rows} columns={columns} getRowId={(i) => i.id} itemLabel="inquiries"
        loading={isPending} refetching={isPlaceholderData} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        paged={{ total: data?.total ?? 0, all: data?.all ?? 0, settled: !!data && !isPlaceholderData }}
        sort={url.sort} onSortChange={url.onSortChange} page={url.page} onPageChange={url.onPageChange} size={url.size} onSizeChange={url.onSizeChange}
        search={<>
          <TableSearch value={url.qInput} onChange={url.setQInput} placeholder="Search name, company or email" />
          <label className="flex w-full items-center gap-2 text-xs font-bold text-muted-foreground md:hidden">
            Sort
            <select value={sortValue} onChange={(e) => url.set({ sort: e.target.value, page: null })} className="field-select h-9 w-full font-normal">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </>}
        empty={url.q ? <EmptyState icon={SearchX} title="No inquiries match this search." actionLabel="Clear search" onAction={url.clearSearch} />
          : <EmptyState icon={MessageSquareText} title="No inquiries yet." description="They appear once the Scraper marks a contact as an inquiry." />} />
      <InboxSheet inquiry={open} onClose={() => setOpen(null)} />
    </PageShell>
  );
}

function InboxButton({ onOpen, name, className }: { onOpen: () => void; name?: string | null; className?: string }) {
  return (
    <Button size="xs" variant="secondary" className={className} onClick={onOpen} aria-label={`View inbox for ${name ?? "this inquiry"}`}>
      <Mail />View inbox
    </Button>
  );
}

/** The inquirer's messages from the Scraper: subject and first lines, newest first. */
function InboxSheet({ inquiry, onClose }: { inquiry: Inquiry | null; onClose: () => void }) {
  const { data, isPending, error, refetch } = useQuery({ ...inquiryTimelineQuery(inquiry?.id ?? 0), enabled: !!inquiry });
  const name = inquiry?.fields.name?.value ?? "No name";
  const company = inquiry?.fields.company?.value;
  return (
    <Sheet open={inquiry !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 border-0 bg-card p-0 data-[side=right]:w-full sm:max-w-[560px] data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-xl font-bold tracking-tight [overflow-wrap:anywhere]">{name}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {[company, (inquiry?.fields.emails?.value ?? [])[0]].filter(Boolean).join(" · ") || "Inquiry"}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {error ? <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
            : isPending ? <PlaceholderRows rows={4} />
            : <Conversations items={data.items} truncated={data.truncated} title="Inbox" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
