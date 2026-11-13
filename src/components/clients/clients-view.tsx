"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download, FileSpreadsheet, FileX2, Plus, SearchX, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { DataTableCard, TableSearch, type Column, type Sort } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EngagementPill, EntityTag, Pill, StageSteps, STAGE_LABEL } from "@/components/shared/pills";
import { companiesQuery, meQuery } from "@/lib/api/queries";
import { errorMessage } from "@/lib/api/http";
import type { CompanyListItem } from "@/lib/api-types";
import { ENTITIES, STAGES } from "@/lib/enums";
import { DASH, ago, daysSince } from "@/lib/format";
import { useUrlFilters } from "@/lib/use-url-filters";
import { cn } from "@/lib/utils";
import { ClientSheet } from "./client-sheet";
import { AddClientDialog } from "./add-client-dialog";

type Status = "active" | "inactive" | "new" | "unset";
const QUICK = [
  { key: "check", label: "Needs check", icon: TriangleAlert, test: (c: CompanyListItem) => c.gmail.needsCheck.length > 0 },
  { key: "recheck", label: "Recheck 90d+", icon: CalendarClock, test: (c: CompanyListItem) => { const d = daysSince(c.lastCheckedBilling); return d === null || d >= 90; } },
  { key: "tin", label: "Missing TIN", icon: FileX2, test: (c: CompanyListItem) => !c.tin },
  { key: "probity", label: "Probity", icon: ShieldCheck, test: (c: CompanyListItem) => c.probity },
  { key: "nogmail", label: "No Gmail yet", icon: SearchX, test: (c: CompanyListItem) => c.gmail.candidateIds.length === 0 },
] as const;

const statusOf = (s: Status, c: CompanyListItem) =>
  s === "new" ? c.isNew : s === "unset" ? c.engagement === null : c.engagement === s;

const mainContact = (c: CompanyListItem) => c.contacts.find((x) => x.billingRole === "main") ?? c.contacts[0];

function matchesSearch(c: CompanyListItem, q: string) {
  if (!q) return true;
  const hay = [c.name, c.alias, c.tradeName, c.tin, c.secNo, ...c.contacts.flatMap((x) => [x.name, ...x.emails, ...x.phones])];
  return hay.some((v) => v?.toLowerCase().includes(q));
}

export function ClientsView() {
  const { get, set } = useUrlFilters();
  const { data, isPending, isFetching, error, refetch } = useQuery(companiesQuery);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { data: me } = useQuery(meQuery);
  const canImport = !!me?.routes.includes("import");
  const all = useMemo(() => data ?? [], [data]);

  const status = get("status") as Status | "";
  const f = { ent: get("ent"), svc: get("svc"), sup: get("sup"), stage: get("stage"), quick: get("quick"), q: get("q") };
  const [qInput, setQInput] = useState(f.q);
  const sortParam = get("sort");
  const sort: Sort = sortParam ? { key: sortParam.split(":")[0], dir: sortParam.endsWith(":desc") ? "desc" : "asc" } : null;
  const page = Number(get("page")) || 1;
  const size = Number(get("size")) || 25;
  const openId = Number(get("id")) || null;

  const services = useMemo(() => [...new Set(all.map((c) => c.acctgService?.trim()).filter(Boolean) as string[])].sort(), [all]);
  const supervisors = useMemo(() => [...new Set(all.map((c) => c.supervisor?.trim()).filter(Boolean) as string[])].sort(), [all]);

  // Everything except the quick chips; chip counts are taken from this set so they combine with the other filters.
  const base = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return all.filter((c) =>
      (!status || statusOf(status, c)) &&
      (!f.ent || c.entities.includes(f.ent as never)) &&
      (!f.svc || c.acctgService?.trim() === f.svc) &&
      (!f.sup || c.supervisor?.trim() === f.sup) &&
      (!f.stage || (f.stage === "none" ? c.gmail.stage === null : c.gmail.stage === f.stage)) &&
      matchesSearch(c, q));
  }, [all, status, f.ent, f.svc, f.sup, f.stage, f.q]);
  const quick = QUICK.find((x) => x.key === f.quick);
  const rows = useMemo(() => (quick ? base.filter(quick.test) : base), [base, quick]);

  const n = all.length || 1;
  const kpi = {
    active: all.filter((c) => c.engagement === "active").length,
    inactive: all.filter((c) => c.engagement === "inactive").length,
    isNew: all.filter((c) => c.isNew).length,
    newActive: all.filter((c) => c.isNew && c.engagement === "active").length,
    unset: all.filter((c) => c.engagement === null).length,
  };
  const pct = (v: number) => `${Math.round((v / n) * 100)}% of clients`;
  const toggleStatus = (s: Status) => set({ status: status === s ? null : s, page: null });
  const filtering = !!(status || f.ent || f.svc || f.sup || f.stage || f.quick || f.q);
  const clearAll = () => { setQInput(""); set({ status: null, ent: null, svc: null, sup: null, stage: null, quick: null, q: null, page: null }); };

  const columns: Column<CompanyListItem>[] = [
    { key: "name", header: "Registered name", sortValue: (c) => c.name, className: "min-w-[14rem] max-md:max-w-[12rem]", render: (c) => {
      const main = mainContact(c);
      const extra = c.contacts.length - 1;
      return (
        <div className="min-w-0">
          <span className="font-semibold">{c.name}</span>
          {c.probity && <Pill tone="info" className="ml-1.5 px-2 py-px align-[2px] text-[11px]">Probity</Pill>}
          {c.gmail.needsCheck.length > 0 && <TriangleAlert aria-label="Needs check" className="ml-1 inline size-3.5 align-[-2px] text-warning" />}
          <span className="block truncate text-xs text-muted-foreground">
            {[c.alias, main ? `${main.name ?? main.emails[0] ?? ""}${extra > 0 ? ` +${extra}` : ""}` : "No contact"].filter(Boolean).join(" · ")}
          </span>
        </div>
      );
    } },
    { key: "eng", header: "Engagement", sortValue: (c) => c.engagement ?? "zz", className: "whitespace-nowrap", render: (c) => <EngagementPill engagement={c.engagement} isNew={c.isNew} /> },
    { key: "stage", header: "Gmail stage", desktopOnly: true, sortValue: (c) => (c.gmail.stage ? STAGES.indexOf(c.gmail.stage) : -1), className: "whitespace-nowrap", render: (c) => <StageSteps stage={c.gmail.stage} /> },
    { key: "svc", header: "Acctg service", desktopOnly: true, render: (c) => c.acctgService ?? <span className="text-muted-foreground">{DASH}</span> },
    { key: "ent", header: "Intercompany", desktopOnly: true, sortValue: (c) => c.entities.join(","), render: (c) => c.entities.length ? c.entities.map((e) => <EntityTag key={e}>{e}</EntityTag>) : <span className="text-muted-foreground">{DASH}</span> },
    { key: "checked", header: "Last checked", desktopOnly: true, sortValue: (c) => c.lastCheckedBilling, className: "whitespace-nowrap", render: (c) => {
      const d = daysSince(c.lastCheckedBilling);
      const stale = d === null || d >= 90;
      return <span className={cn("tabular-nums", stale ? "font-semibold text-warning" : "text-muted-foreground")}>{d === null ? "Never" : ago(c.lastCheckedBilling)}</span>;
    } },
    { key: "last", header: "Last contact", desktopOnly: true, sortValue: (c) => c.gmail.lastContact, className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (c) => ago(c.gmail.lastContact) },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <PageHeader title="Clients" description="The accounting master list. The Scraper reads these clients and contacts to tag Gmail."
        actions={<>
          <Button variant="secondary" nativeButton={false} render={<a href="/api/companies/export" download />}><Download />Export CSV</Button>
          <Button onClick={() => setAdding(true)}><Plus />Add client</Button>
        </>} />

      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <KpiCard label="Active" value={kpi.active.toLocaleString()} sub={pct(kpi.active)} tone="good" loading={isPending} pressed={status === "active"} onClick={() => toggleStatus("active")} />
        <KpiCard label="Inactive" value={kpi.inactive.toLocaleString()} sub={pct(kpi.inactive)} tone="muted" loading={isPending} pressed={status === "inactive"} onClick={() => toggleStatus("inactive")} />
        <KpiCard label="New" value={kpi.isNew.toLocaleString()} sub={`${kpi.newActive} already active`} tone="muted" dot="good" loading={isPending} pressed={status === "new"} onClick={() => toggleStatus("new")} />
        <KpiCard label="Not set" value={kpi.unset.toLocaleString()} sub={kpi.unset ? "Status blank; backfill" : "All set"} tone={kpi.unset ? "warn" : "good"} loading={isPending} pressed={status === "unset"} onClick={() => toggleStatus("unset")} />
      </div>

      <div className="flex flex-col rounded-2xl bg-sunk px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="w-full shrink-0 text-xs font-semibold text-muted-foreground md:w-32">Filter by</span>
          <FilterSelect label="Intercompany" value={f.ent} onChange={(v) => set({ ent: v, page: null })} options={ENTITIES.map((e) => ({ value: e, label: e }))} />
          <FilterSelect label="Acctg service" value={f.svc} onChange={(v) => set({ svc: v, page: null })} options={services.map((s) => ({ value: s, label: s }))} />
          <FilterSelect label="Supervisor" value={f.sup} onChange={(v) => set({ sup: v, page: null })} options={supervisors.map((s) => ({ value: s, label: s }))} />
          <FilterSelect label="Gmail stage" value={f.stage} onChange={(v) => set({ stage: v, page: null })}
            options={[...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })), { value: "none", label: "No Gmail" }]} />
          {filtering && <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={clearAll}><X />Clear all</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-1 pt-1 pb-2">
          <span className="w-full shrink-0 text-xs font-semibold text-muted-foreground md:w-32">Needs attention</span>
          {QUICK.map(({ key, label, icon: Icon, test }) => {
            const count = base.filter(test).length;
            const on = f.quick === key;
            return (
              <button key={key} type="button" aria-pressed={on} disabled={!count && !on} onClick={() => set({ quick: on ? null : key, page: null })}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
                  on ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text" : "text-muted-foreground hover:bg-lift hover:text-foreground")}>
                <Icon aria-hidden className="size-3.5" />{label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", !on && "bg-accent")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DataTableCard title="Clients" rows={rows} total={all.length} columns={columns} getRowId={(c) => c.id} itemLabel="clients"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        onRowClick={(c) => set({ id: c.id })} rowLabel={(c) => `Open ${c.name}`}
        rowClassName={(c) => (c.id === openId ? "[&>td]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]" : undefined)}
        sort={sort} onSortChange={(s) => set({ sort: s ? `${s.key}:${s.dir}` : null, page: null })}
        page={page} onPageChange={(p) => set({ page: p === 1 ? null : p })} size={size} onSizeChange={(s) => set({ size: s === 25 ? null : s, page: null })}
        search={<TableSearch slashFocus value={qInput} placeholder="Search name, alias, TIN, SEC no., contact, email" onChange={(v) => { setQInput(v); set({ q: v.trim() || null, page: null }); }} />}
        empty={filtering
          ? <EmptyState icon={SearchX} title="No clients match these filters." actionLabel="Clear filters" onAction={clearAll} />
          : <EmptyState icon={FileSpreadsheet} title="No clients yet." description={canImport ? "Import the clients workbook, or add the first client by hand." : "Add the first client by hand."}
              actionLabel={canImport ? "Open Import" : "Add client"} onAction={() => canImport ? router.push("/import") : setAdding(true)} />}
      />

      <ClientSheet id={openId} onClose={() => set({ id: null })} />
      <AddClientDialog open={adding || get("new") === "1"} prefill={{ name: get("name") || undefined, email: get("email") || undefined, contactName: get("contact") || undefined }}
        onOpenChange={(o) => { setAdding(o); if (!o && get("new")) set({ new: null, name: null, email: null, contact: null }); }}
        onCreated={(id) => set({ id, new: null, name: null, email: null, contact: null })} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string | null) => void; options: { value: string; label: string }[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value || null)}
      className={cn("field-select min-w-0 flex-1 basis-[9rem] md:flex-none md:basis-auto", value && "text-primary-text")}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
