"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, SearchX, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordDialog, listOf, textOrNull, type RecordField, type RecordValues } from "@/components/shared/record-dialog";
import { errorMessage, request } from "@/lib/api/http";
import { keys, suppliersQuery } from "@/lib/api/queries";
import type { SupplierInput, SupplierItem, SupplierResponse } from "@/lib/api-types";
import { DASH } from "@/lib/format";

const FIELDS: RecordField[] = [
  { key: "name", label: "Supplier / contractor", full: true },
  { key: "particulars", label: "Particulars", kind: "textarea" },
  { key: "contactName", label: "Contact name" },
  { key: "phones", label: "Phone numbers", kind: "list" },
  { key: "emails", label: "Email addresses", kind: "list" },
];
const toValues = (s?: SupplierItem): RecordValues => ({ name: s?.name ?? "", particulars: s?.particulars ?? "", contactName: s?.contactName ?? "", phones: s?.phones.join(", ") ?? "", emails: s?.emails.join(", ") ?? "" });
const toBody = (v: RecordValues): SupplierInput => ({ name: textOrNull(v.name), particulars: textOrNull(v.particulars), contactName: textOrNull(v.contactName), phones: listOf(v.phones), emails: listOf(v.emails).map((e) => e.toLowerCase()) });

export function SuppliersView() {
  const qc = useQueryClient();
  const { data, isPending, isFetching, error, refetch } = useQuery(suppliersQuery);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<SupplierItem | "new" | null>(null);
  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => [x.name, x.particulars, x.contactName, ...x.emails, ...x.phones].some((v) => v?.toLowerCase().includes(s))) : all;
  }, [all, q]);

  async function save(v: RecordValues) {
    const body = toBody(v);
    if (editing && editing !== "new") await request<SupplierResponse>(`/api/suppliers/${editing.id}`, { method: "PATCH", json: body });
    else await request<SupplierResponse>("/api/suppliers", { json: body });
    await Promise.all([keys.suppliers, keys.counts].map((queryKey) => qc.invalidateQueries({ queryKey })));
    toast.success(editing === "new" ? "Supplier added" : "Supplier saved");
  }

  const columns: Column<SupplierItem>[] = [
    { key: "name", header: "Supplier / contractor", sortValue: (s) => s.name, className: "min-w-[12rem] font-semibold", render: (s) => s.name ?? <span className="font-normal text-muted-foreground">Unnamed</span> },
    { key: "part", header: "Particulars", className: "max-w-[22rem] text-muted-foreground", render: (s) => <span className="line-clamp-2">{s.particulars ?? DASH}</span> },
    { key: "contact", header: "Contact", desktopOnly: true, render: (s) => <div><span>{s.contactName ?? DASH}</span>{s.phones.length > 0 && <span className="block text-xs text-muted-foreground tabular-nums">{s.phones.join(", ")}</span>}</div> },
    { key: "email", header: "Email", desktopOnly: true, render: (s) => s.emails.length ? <div className="flex flex-col">{s.emails.map((e) => <a key={e} href={`mailto:${e}`} onClick={(ev) => ev.stopPropagation()} className="link-draw w-fit break-all">{e}</a>)}</div> : DASH },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <PageHeader title="OPS suppliers" description="Suppliers and contractors from the OPS Supplier tab. A separate list; never matched to clients."
        actions={<Button onClick={() => setEditing("new")}><Plus />Add supplier</Button>} />
      <DataTableCard title="Suppliers" rows={rows} total={all.length} columns={columns} getRowId={(s) => s.id} itemLabel="suppliers"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        onRowClick={(s) => setEditing(s)} rowLabel={(s) => `Edit ${s.name ?? "supplier"}`}
        search={<TableSearch value={q} onChange={setQ} placeholder="Search supplier, particulars, contact" />}
        empty={q ? <EmptyState icon={SearchX} title="No suppliers match this search." actionLabel="Clear search" onAction={() => setQ("")} />
          : <EmptyState icon={Truck} title="No suppliers yet." description="They arrive with the Excel import, or add one by hand." actionLabel="Add supplier" onAction={() => setEditing("new")} />} />
      <RecordDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} fields={FIELDS}
        title={editing === "new" ? "Add supplier" : "Edit supplier"} submitLabel={editing === "new" ? "Add supplier" : "Save supplier"}
        initial={toValues(editing && editing !== "new" ? editing : undefined)} onSubmit={save} />
    </div>
  );
}
