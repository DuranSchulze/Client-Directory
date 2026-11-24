"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Contact, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RecordDialog, listOf, textOrNull, type RecordField, type RecordValues } from "@/components/shared/record-dialog";
import { errorMessage, request } from "@/lib/api/http";
import { deptEmailsPageQuery, keys } from "@/lib/api/queries";
import { usePagedList, usePagedUrlState } from "@/lib/api/use-paged-list";
import type { DeptEmailInput, DeptEmailItem, DeptEmailResponse } from "@/lib/api-types";
import { DASH } from "@/lib/format";
import { cn } from "@/lib/utils";

const topOf = (department: string) => department.split(" · ")[0];

export function DeptEmailsView() {
  const qc = useQueryClient();
  const url = usePagedUrlState();
  const dept = url.get("dept");
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = usePagedList(deptEmailsPageQuery, dept ? { ...url.params, dept } : url.params);
  const [editing, setEditing] = useState<DeptEmailItem | "new" | null>(null);
  // Server returns the page in sheet order (sort order, then id); departments cover the whole list, not just this page.
  const rows = data?.items ?? [];
  const departments = useMemo(() => (data?.departments ?? []).map((d) => d.department), [data]);
  // Chips use the top-level department ("LEGAL DEPARTMENT"); its teams stay as group headings in the table.
  const tops = useMemo(() => {
    const out = new Map<string, number>();
    for (const d of data?.departments ?? []) out.set(topOf(d.department), (out.get(topOf(d.department)) ?? 0) + d.count);
    return [...out];
  }, [data]);
  const setDept = (d: string) => url.set({ dept: d || null, page: null });

  const fields: RecordField[] = [
    { key: "department", label: "Department", required: true, full: true, hint: departments.length ? `Existing: ${departments.slice(0, 4).join(", ")}${departments.length > 4 ? "…" : ""}` : undefined },
    { key: "name", label: "Name", hint: "Leave empty for a shared mailbox" },
    { key: "title", label: "Title" },
    { key: "emails", label: "Email addresses", kind: "list", required: true },
  ];

  async function save(v: RecordValues) {
    const body: DeptEmailInput = { department: v.department.trim(), name: textOrNull(v.name), title: textOrNull(v.title), emails: listOf(v.emails).map((e) => e.toLowerCase()) };
    if (editing && editing !== "new") await request<DeptEmailResponse>(`/api/dept-emails/${editing.id}`, { method: "PATCH", json: body });
    else await request<DeptEmailResponse>("/api/dept-emails", { json: body }); // the server appends after the last mailbox
    await Promise.all([keys.deptEmails, keys.counts, keys.needsCompany].map((queryKey) => qc.invalidateQueries({ queryKey })));
    toast.success(editing === "new" ? "Mailbox added" : "Mailbox saved");
  }

  const columns: Column<DeptEmailItem>[] = [
    { key: "name", header: "Name", className: "min-w-[10rem] font-semibold", render: (d) => d.name ?? <span className="font-normal text-muted-foreground">Shared mailbox</span> },
    { key: "title", header: "Title", desktopOnly: true, className: "text-muted-foreground", render: (d) => d.title ?? DASH },
    { key: "emails", header: "Email addresses", render: (d) => <div className="flex flex-wrap gap-1.5">{d.emails.map((e) => <span key={e} className="rounded-md bg-sunk px-2 py-0.5 text-[13px] break-all">{e}</span>)}</div> },
  ];

  return (
    <PageShell>
      <PageHeader title="Department emails" description="Internal staff and shared mailboxes. These addresses are never clients and never land in Needs company."
        actions={<Button onClick={() => setEditing("new")}><Plus />Add mailbox</Button>} />
      {tops.length > 1 && (
        <div role="group" aria-label="Filter by department" className="flex flex-wrap gap-2">
          {[{ name: "", label: "All departments", n: data?.all ?? 0 }, ...tops.map(([d, n]) => ({ name: d, label: d, n }))].map(({ name, label, n }) => {
            const on = dept === name;
            return (
              <button key={name || "all"} type="button" aria-pressed={on} onClick={() => setDept(name)}
                className={cn("inline-flex h-8 items-center gap-2 rounded-full border border-input px-3 text-xs font-semibold transition-transform outline-none hover:-translate-y-0.5 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                  on ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-foreground")}>
                {label}<span className={cn("tabular-nums", on ? "opacity-80" : "text-muted-foreground")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <DataTableCard title="Internal mailboxes" rows={rows} columns={columns} getRowId={(d) => d.id} itemLabel="mailboxes" showRowNumbers={false}
        groupBy={(d) => d.department}
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        paged={{ total: data?.total ?? 0, all: data?.all ?? 0, settled: !!data && !isPlaceholderData }}
        page={url.page} onPageChange={url.onPageChange} size={url.size} onSizeChange={url.onSizeChange}
        onRowClick={(d) => setEditing(d)} rowLabel={(d) => `Edit ${d.name ?? d.emails[0]}`}
        search={<TableSearch value={url.qInput} onChange={url.setQInput} placeholder="Search department, name, email" />}
        empty={url.q || dept ? <EmptyState icon={SearchX} title="No mailboxes match these filters." actionLabel="Clear filters" onAction={() => { url.setQInput(""); url.set({ q: null, dept: null, page: null }); }} />
          : <EmptyState icon={Contact} title="No internal mailboxes yet." description="They arrive with the Excel import, or add one by hand." actionLabel="Add mailbox" onAction={() => setEditing("new")} />} />
      <RecordDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} fields={fields}
        title={editing === "new" ? "Add internal mailbox" : "Edit internal mailbox"} submitLabel={editing === "new" ? "Add mailbox" : "Save mailbox"}
        initial={editing && editing !== "new" ? { department: editing.department, name: editing.name ?? "", title: editing.title ?? "", emails: editing.emails.join(", ") } : { department: departments[0] ?? "", name: "", title: "", emails: "" }}
        onSubmit={save} />
    </PageShell>
  );
}
