"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Pencil, Plus, SearchX, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordDialog, listOf, textOrNull, type RecordField, type RecordValues } from "@/components/shared/record-dialog";
import { errorMessage, request } from "@/lib/api/http";
import { keys, probityPageQuery } from "@/lib/api/queries";
import { usePagedList, usePagedUrlState } from "@/lib/api/use-paged-list";
import type { ProbityInput, ProbityItem, ProbityItemResponse } from "@/lib/api-types";
import { DASH, day } from "@/lib/format";

const FIELDS: RecordField[] = [
  { key: "companyListed", label: "Company (as listed)", required: true, full: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "referenceNo", label: "Reference number", hint: "For example F2026 - 022" },
  { key: "emails", label: "Email addresses", kind: "list" },
  { key: "service", label: "Service" },
  { key: "draftedOn", label: "Date drafted", kind: "date" },
  { key: "remarks", label: "Remarks / status", kind: "textarea" },
];
const toValues = (p?: ProbityItem): RecordValues => ({
  companyListed: p?.companyListed ?? "", contactPerson: p?.contactPerson ?? "", referenceNo: p?.referenceNo ?? "", emails: p?.emails.join(", ") ?? "",
  service: p?.service ?? "Probity", draftedOn: p?.draftedOn ?? "", agreementUrl: p?.agreementUrl ?? "", remarks: p?.remarks ?? "",
});
const toBody = (v: RecordValues): ProbityInput => ({
  companyListed: v.companyListed.trim(), contactPerson: textOrNull(v.contactPerson), referenceNo: textOrNull(v.referenceNo), emails: listOf(v.emails).map((e) => e.toLowerCase()),
  service: textOrNull(v.service), draftedOn: textOrNull(v.draftedOn), agreementUrl: textOrNull(v.agreementUrl), remarks: textOrNull(v.remarks),
});

export function ProbityView() {
  const router = useRouter();
  const qc = useQueryClient();
  const url = usePagedUrlState();
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = usePagedList(probityPageQuery, url.params);
  const [editing, setEditing] = useState<ProbityItem | "new" | null>(null);
  const rows = data?.items ?? [];

  async function save(v: RecordValues) {
    const body = toBody(v);
    if (editing && editing !== "new") await request<ProbityItemResponse>(`/api/probity/${editing.id}`, { method: "PATCH", json: body });
    else await request<ProbityItemResponse>("/api/probity", { json: body });
    await Promise.all([keys.probity, keys.counts, keys.companies].map((queryKey) => qc.invalidateQueries({ queryKey })));
    toast.success(editing === "new" ? "Probity row added" : "Probity row saved");
  }

  const columns: Column<ProbityItem>[] = [
    { key: "listed", header: "Company (as listed)", sortValue: (p) => p.companyListed, className: "min-w-[12rem] font-semibold", render: (p) => p.companyListed },
    { key: "match", header: "In All Clients", sortValue: (p) => (p.companyId ? 0 : 1), className: "min-w-[11rem]", render: (p) => p.companyId
      ? <span className="inline-flex items-center gap-1.5"><CircleCheck aria-hidden className="size-4 shrink-0 text-success" /><span className="truncate">{p.companyName}</span></span>
      : <span className="inline-flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 font-semibold text-destructive"><CircleX aria-hidden className="size-4" />Not found</span>
          <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); router.push(`/clients?new=1&name=${encodeURIComponent(p.companyListed)}${p.emails[0] ? `&email=${encodeURIComponent(p.emails[0])}` : ""}${p.contactPerson ? `&contact=${encodeURIComponent(p.contactPerson)}` : ""}`); }}>
            <UserPlus />Add as client
          </Button>
        </span> },
    { key: "contact", header: "Contact", desktopOnly: true, render: (p) => <div className="min-w-0"><span>{p.contactPerson ?? DASH}</span>{p.emails[0] && <span className="block truncate text-xs text-muted-foreground">{p.emails.join(", ")}</span>}</div> },
    { key: "ref", header: "Reference", desktopOnly: true, sortValue: (p) => p.referenceNo, className: "whitespace-nowrap tabular-nums", render: (p) => p.referenceNo ?? DASH },
    { key: "drafted", header: "Drafted", desktopOnly: true, sortValue: (p) => p.draftedOn, className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (p) => day(p.draftedOn) },
    { key: "remarks", header: "Remarks / status", desktopOnly: true, className: "max-w-[16rem] text-muted-foreground", render: (p) => <span className="line-clamp-2">{p.remarks ?? DASH}</span> },
    { key: "edit", header: "", className: "w-10", render: (p) => (
      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.companyListed}`} onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil /></Button>
    ) },
  ];

  return (
    <PageShell>
      <PageHeader title="Probity" description={!data ? "Probity Clients tab, cross-checked against All Clients." : `${data.matched} of ${data.all} rows matched to a client by email or name. Matched rows open the client.`}
        actions={<Button onClick={() => setEditing("new")}><Plus />Add probity row</Button>} />
      <DataTableCard title="Probity clients" rows={rows} columns={columns} getRowId={(p) => p.id} itemLabel="rows"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        paged={{ total: data?.total ?? 0, all: data?.all ?? 0, settled: !!data && !isPlaceholderData }}
        sort={url.sort} onSortChange={url.onSortChange} page={url.page} onPageChange={url.onPageChange} size={url.size} onSizeChange={url.onSizeChange}
        onRowClick={(p) => (p.companyId ? router.push(`/clients?id=${p.companyId}`) : setEditing(p))}
        rowLabel={(p) => (p.companyId ? `Open ${p.companyName}` : `Edit ${p.companyListed}`)}
        search={<TableSearch value={url.qInput} onChange={url.setQInput} placeholder="Search company, contact, reference" />}
        empty={url.q ? <EmptyState icon={SearchX} title="No probity rows match this search." actionLabel="Clear search" onAction={url.clearSearch} />
          : <EmptyState icon={ShieldCheck} title="No probity rows yet." description="They arrive with the Excel import, or add one by hand." actionLabel="Add probity row" onAction={() => setEditing("new")} />} />
      <RecordDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} fields={FIELDS}
        title={editing === "new" ? "Add probity row" : "Edit probity row"} submitLabel={editing === "new" ? "Add row" : "Save row"}
        description="Saving re-runs the match against All Clients: email first, then registered name, alias or trade name."
        initial={toValues(editing && editing !== "new" ? editing : undefined)} onSubmit={save}
        validate={(v) => (v.agreementUrl && !/^https?:\/\//.test(v.agreementUrl.trim()) ? { agreementUrl: "Use a full link starting with https://." } : {})} />
    </PageShell>
  );
}
