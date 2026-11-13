"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Pencil, Plus, SearchX, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordDialog, listOf, textOrNull, type RecordField, type RecordValues } from "@/components/shared/record-dialog";
import { errorMessage, request } from "@/lib/api/http";
import { keys, probityQuery } from "@/lib/api/queries";
import type { ProbityInput, ProbityItem, ProbityItemResponse } from "@/lib/api-types";
import { DASH, day } from "@/lib/format";

const FIELDS: RecordField[] = [
  { key: "companyListed", label: "Company (as listed)", required: true, full: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "referenceNo", label: "Reference number", hint: "For example F2026 - 022" },
  { key: "emails", label: "Email addresses", kind: "list" },
  { key: "service", label: "Service" },
  { key: "draftedOn", label: "Date drafted", kind: "date" },
  { key: "agreementUrl", label: "Link of signed agreement", kind: "url", full: true },
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
  const { data, isPending, isFetching, error, refetch } = useQuery(probityQuery);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProbityItem | "new" | null>(null);
  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((p) => [p.companyListed, p.companyName, p.contactPerson, p.referenceNo, p.remarks, ...p.emails].some((x) => x?.toLowerCase().includes(s))) : all;
  }, [all, q]);
  const matched = all.filter((p) => p.companyId !== null).length;

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
    { key: "agreement", header: "Agreement", desktopOnly: true, render: (p) => p.agreementUrl
      ? <a href={p.agreementUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="link-draw whitespace-nowrap">Signed copy</a>
      : <span className="font-semibold text-destructive">Missing</span> },
    { key: "remarks", header: "Remarks / status", desktopOnly: true, className: "max-w-[16rem] text-muted-foreground", render: (p) => <span className="line-clamp-2">{p.remarks ?? DASH}</span> },
    { key: "edit", header: "", className: "w-10", render: (p) => (
      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.companyListed}`} onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil /></Button>
    ) },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <PageHeader title="Probity" description={isPending ? "Probity Clients tab, cross-checked against All Clients." : `${matched} of ${all.length} rows matched to a client by email or name. Matched rows open the client.`}
        actions={<Button onClick={() => setEditing("new")}><Plus />Add probity row</Button>} />
      <DataTableCard title="Probity clients" rows={rows} total={all.length} columns={columns} getRowId={(p) => p.id} itemLabel="rows"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        onRowClick={(p) => (p.companyId ? router.push(`/clients?id=${p.companyId}`) : setEditing(p))}
        rowLabel={(p) => (p.companyId ? `Open ${p.companyName}` : `Edit ${p.companyListed}`)}
        search={<TableSearch value={q} onChange={setQ} placeholder="Search company, contact, reference" />}
        empty={q ? <EmptyState icon={SearchX} title="No probity rows match this search." actionLabel="Clear search" onAction={() => setQ("")} />
          : <EmptyState icon={ShieldCheck} title="No probity rows yet." description="They arrive with the Excel import, or add one by hand." actionLabel="Add probity row" onAction={() => setEditing("new")} />} />
      <RecordDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} fields={FIELDS}
        title={editing === "new" ? "Add probity row" : "Edit probity row"} submitLabel={editing === "new" ? "Add row" : "Save row"}
        description="Saving re-runs the match against All Clients: email first, then registered name, alias or trade name."
        initial={toValues(editing && editing !== "new" ? editing : undefined)} onSubmit={save}
        validate={(v) => (v.agreementUrl && !/^https?:\/\//.test(v.agreementUrl.trim()) ? { agreementUrl: "Use a full link starting with https://." } : {})} />
    </div>
  );
}
