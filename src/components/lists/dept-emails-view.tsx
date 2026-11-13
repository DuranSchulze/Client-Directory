"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordDialog, listOf, textOrNull, type RecordField, type RecordValues } from "@/components/shared/record-dialog";
import { errorMessage, request } from "@/lib/api/http";
import { deptEmailsQuery, keys } from "@/lib/api/queries";
import type { DeptEmailInput, DeptEmailItem, DeptEmailResponse } from "@/lib/api-types";
import { DASH } from "@/lib/format";

export function DeptEmailsView() {
  const qc = useQueryClient();
  const { data, isPending, isFetching, error, refetch } = useQuery(deptEmailsQuery);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<DeptEmailItem | "new" | null>(null);
  // Department order as the sheet lists it, then people by sort order.
  const all = useMemo(() => [...(data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [data]);
  const departments = useMemo(() => [...new Set(all.map((d) => d.department))], [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => [x.department, x.name, x.title, ...x.emails].some((v) => v?.toLowerCase().includes(s))) : all;
  }, [all, q]);

  const fields: RecordField[] = [
    { key: "department", label: "Department", required: true, full: true, hint: departments.length ? `Existing: ${departments.slice(0, 4).join(", ")}${departments.length > 4 ? "…" : ""}` : undefined },
    { key: "name", label: "Name", hint: "Leave empty for a shared mailbox" },
    { key: "title", label: "Title" },
    { key: "emails", label: "Email addresses", kind: "list", required: true },
  ];

  async function save(v: RecordValues) {
    const body: DeptEmailInput = { department: v.department.trim(), name: textOrNull(v.name), title: textOrNull(v.title), emails: listOf(v.emails).map((e) => e.toLowerCase()) };
    if (editing && editing !== "new") await request<DeptEmailResponse>(`/api/dept-emails/${editing.id}`, { method: "PATCH", json: body });
    else await request<DeptEmailResponse>("/api/dept-emails", { json: { ...body, sortOrder: (all.at(-1)?.sortOrder ?? 0) + 1 } });
    await Promise.all([keys.deptEmails, keys.counts, keys.needsCompany].map((queryKey) => qc.invalidateQueries({ queryKey })));
    toast.success(editing === "new" ? "Mailbox added" : "Mailbox saved");
  }

  const columns: Column<DeptEmailItem>[] = [
    { key: "name", header: "Name", className: "min-w-[10rem] font-semibold", render: (d) => d.name ?? <span className="font-normal text-muted-foreground">Shared mailbox</span> },
    { key: "title", header: "Title", desktopOnly: true, className: "text-muted-foreground", render: (d) => d.title ?? DASH },
    { key: "emails", header: "Email addresses", render: (d) => <div className="flex flex-col">{d.emails.map((e) => <span key={e} className="break-all">{e}</span>)}</div> },
  ];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <PageHeader title="Dept. emails" description="Internal staff and shared mailboxes. These addresses are never clients and never land in Needs company."
        actions={<Button onClick={() => setEditing("new")}><Plus />Add mailbox</Button>} />
      <DataTableCard title="Internal mailboxes" rows={rows} total={all.length} columns={columns} getRowId={(d) => d.id} itemLabel="mailboxes" showRowNumbers={false}
        groupBy={(d) => d.department}
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        onRowClick={(d) => setEditing(d)} rowLabel={(d) => `Edit ${d.name ?? d.emails[0]}`}
        search={<TableSearch value={q} onChange={setQ} placeholder="Search department, name, email" />}
        empty={q ? <EmptyState icon={SearchX} title="No mailboxes match this search." actionLabel="Clear search" onAction={() => setQ("")} />
          : <EmptyState icon={Contact} title="No internal mailboxes yet." description="They arrive with the Excel import, or add one by hand." actionLabel="Add mailbox" onAction={() => setEditing("new")} />} />
      <RecordDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} fields={fields}
        title={editing === "new" ? "Add internal mailbox" : "Edit internal mailbox"} submitLabel={editing === "new" ? "Add mailbox" : "Save mailbox"}
        initial={editing && editing !== "new" ? { department: editing.department, name: editing.name ?? "", title: editing.title ?? "", emails: editing.emails.join(", ") } : { department: departments[0] ?? "", name: "", title: "", emails: "" }}
        onSubmit={save} />
    </div>
  );
}
