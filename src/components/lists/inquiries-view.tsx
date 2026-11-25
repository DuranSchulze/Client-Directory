"use client";

import { useRouter } from "next/navigation";
import { MessageSquareText, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { DataTableCard, TableSearch, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, STAGE_LABEL } from "@/components/shared/pills";
import { errorMessage } from "@/lib/api/http";
import { inquiriesPageQuery } from "@/lib/api/queries";
import { usePagedList, usePagedUrlState } from "@/lib/api/use-paged-list";
import type { Inquiry } from "@/lib/api-types";
import { ago, DASH } from "@/lib/format";

export function InquiriesView() {
  const router = useRouter();
  const url = usePagedUrlState("last_contact:desc");
  const { data, isPending, isPlaceholderData, error, refetch } = usePagedList(inquiriesPageQuery, url.params);
  const rows = data?.items ?? [];

  const columns: Column<Inquiry>[] = [
    { key: "name", header: "Inquirer", sortValue: (i) => i.fields.name?.value ?? "", className: "min-w-[14rem]", render: (i) => {
      const emails = (i.fields.emails?.value ?? []).filter((e): e is string => typeof e === "string");
      return (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {i.fields.name?.value ?? <span className="font-normal text-muted-foreground">No name</span>}
            {i.reviewState === "pending" && <Pill tone="warning" className="text-[11px]">Not reviewed</Pill>}
          </span>
          {emails.map((e) => <a key={e} href={`mailto:${e}`} onClick={(ev) => ev.stopPropagation()} className="link-draw w-fit break-all text-xs text-muted-foreground">{e}</a>)}
        </div>
      );
    } },
    { key: "company", header: "Company", sortValue: (i) => i.fields.company?.value ?? "", render: (i) => i.fields.company?.value ?? DASH },
    { key: "stage", header: "Stage", sortValue: (i) => i.fields.stage?.value ?? "", render: (i) => i.fields.stage?.value ? <Pill tone="neutral">{STAGE_LABEL[i.fields.stage.value]}</Pill> : DASH },
    { key: "department", header: "Department", desktopOnly: true, className: "text-muted-foreground", render: (i) => i.fields.department?.value ?? DASH },
    { key: "last_contact", header: "Last contact", sortValue: (i) => i.fields.last_contact?.value ?? "", className: "whitespace-nowrap tabular-nums",
      render: (i) => i.fields.last_contact?.value ? <time dateTime={i.fields.last_contact.value} title={new Date(i.fields.last_contact.value).toLocaleString()}>{ago(i.fields.last_contact.value)}</time> : DASH },
    { key: "client", header: "Client", render: (i) => i.client
      ? <span className="link-draw font-semibold text-primary-text">{i.client.name}</span>
      : <span className="text-muted-foreground">Not a client yet</span> },
  ];

  return (
    <PageShell>
      <PageHeader title="Inquiries" description="Everyone the Scraper marked as an inquiry, newest contact first. Rows with a client open that client." />
      <DataTableCard title="Inquiries" rows={rows} columns={columns} getRowId={(i) => i.id} itemLabel="inquiries"
        loading={isPending} refetching={isPlaceholderData} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        paged={{ total: data?.total ?? 0, all: data?.all ?? 0, settled: !!data && !isPlaceholderData }}
        sort={url.sort} onSortChange={url.onSortChange} page={url.page} onPageChange={url.onPageChange} size={url.size} onSizeChange={url.onSizeChange}
        onRowClick={(i) => { if (i.client) router.push(`/clients?id=${i.client.companyId}`); }}
        rowLabel={(i) => i.client ? `Open ${i.client.name}` : `${i.fields.name?.value ?? "Inquiry"}, not a client yet`}
        search={<TableSearch value={url.qInput} onChange={url.setQInput} placeholder="Search name, company or email" />}
        empty={url.q ? <EmptyState icon={SearchX} title="No inquiries match this search." actionLabel="Clear search" onAction={url.clearSearch} />
          : <EmptyState icon={MessageSquareText} title="No inquiries yet." description="They appear once the Scraper marks a contact as an inquiry." />} />
    </PageShell>
  );
}
