"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download, FileSpreadsheet, FileX2, Plus, SearchX, ShieldCheck, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MasterUploadNote } from "@/components/shared/master-upload-note";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { KpiCard } from "@/components/shared/kpi-card";
import { DataTableCard, TableSearch, type Column, type Sort } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EngagementPill, EntityTag, Pill, StageSteps, STAGE_LABEL } from "@/components/shared/pills";
import { companiesPageQuery, countsQuery, meQuery, type PageParams } from "@/lib/api/queries";
import { usePagedList } from "@/lib/api/use-paged-list";
import { errorMessage } from "@/lib/api/http";
import type { CompanyListItem } from "@/lib/api-types";
import { ENTITIES, STAGES } from "@/lib/enums";
import { DASH, ago, day, daysSince, validDay } from "@/lib/format";
import { useUrlFilters } from "@/lib/use-url-filters";
import { cn } from "@/lib/utils";
import { ClientSheet } from "./client-sheet";
import { SourceBadges } from "./source-badge";
import { AddClientDialog } from "./add-client-dialog";

type Status = "active" | "inactive" | "new" | "unset";
// Counts come from the server (chipCounts). `panel` ones show under "Needs attention"; probity and nogmail stay valid in old URLs but now live in the Source and Gmail stage filters.
const QUICK = [
  { key: "check", label: "Needs check", panel: true, icon: TriangleAlert },
  { key: "recheck", label: "Recheck after 90 days", panel: true, icon: CalendarClock },
  { key: "tin", label: "Missing TIN", panel: true, icon: FileX2 },
  { key: "probity", label: "Probity", panel: false, icon: ShieldCheck },
  { key: "nogmail", label: "No Gmail yet", panel: false, icon: SearchX },
] as const;

const mainContact = (c: CompanyListItem) => c.contacts.find((x) => x.billingRole === "main") ?? c.contacts[0];
const FILTER_KEYS = ["status", "ent", "svc", "sup", "stage", "src", "from", "to", "quick", "q", "sort"] as const;
const NO_KPI = { active: 0, inactive: 0, isNew: 0, newActive: 0, unset: 0 };

export function ClientsView() {
  const { get, set } = useUrlFilters();
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { data: me } = useQuery(meQuery);
  const { data: counts } = useQuery(countsQuery);
  const canImport = !!me?.routes.includes("import");

  const status = get("status") as Status | "";
  const f = { ent: get("ent"), svc: get("svc"), sup: get("sup"), stage: get("stage"), src: get("src"), from: validDay(get("from")), to: validDay(get("to")), quick: get("quick"), q: get("q") };
  const [qInput, setQInput] = useState(f.q);
  // The search commits after a pause and resets the page in the same URL update.
  useEffect(() => {
    const typed = qInput.trim();
    if (typed === f.q) return;
    const t = setTimeout(() => set({ q: typed || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [qInput, f.q, set]);
  const sortParam = get("sort");
  const sort: Sort = sortParam ? { key: sortParam.split(":")[0], dir: sortParam.endsWith(":desc") ? "desc" : "asc" } : null;
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);
  const size = [10, 25, 50, 100].includes(Number(get("size"))) ? Number(get("size")) : 25;
  const openId = Number(get("id")) || null;

  const params = useMemo(() => {
    const out: PageParams = { page: String(page), size: String(size) };
    for (const key of FILTER_KEYS) { const v = key === "from" ? f.from : key === "to" ? f.to : get(key); if (v) out[key] = v; }
    return out;
    // f.from/f.to are derived from get; get changes whenever the URL does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, page, size]);
  // Every Clients page request re-reads the cached rollup on the server, so only page 2 is prefetched.
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = usePagedList(companiesPageQuery, params, 1);
  const rows = data?.items ?? [];
  const services = data?.facets.services ?? [];
  const supervisors = data?.facets.supervisors ?? [];
  const quick = QUICK.find((x) => x.key === f.quick);
  const n = data?.all || 1;
  const kpi = data?.kpi ?? NO_KPI;
  const pct = (v: number) => `${Math.round((v / n) * 100)}% of clients`;
  const toggleStatus = (s: Status) => set({ status: status === s ? null : s, page: null });
  const filtering = !!(status || f.ent || f.svc || f.sup || f.stage || f.src || f.from || f.to || f.quick || f.q);
  const clearAll = () => { setQInput(""); set({ status: null, ent: null, svc: null, sup: null, stage: null, src: null, from: null, to: null, quick: null, q: null, page: null }); };
  const addedText = f.from && f.to ? `${f.from} to ${f.to}` : f.from ? `from ${f.from}` : `until ${f.to}`;
  const stageLabel = f.stage === "none" ? "No Gmail yet" : STAGE_LABEL[f.stage as keyof typeof STAGE_LABEL] ?? f.stage;
  const srcLabel = { master: "Master list only", scraper: "Has Scraper contacts", probity: "In Probity" }[f.src] ?? f.src;
  const chips = [
    f.ent && { key: "ent", text: `Intercompany: ${f.ent}`, clear: () => set({ ent: null, page: null }) },
    f.svc && { key: "svc", text: `Accounting service: ${f.svc}`, clear: () => set({ svc: null, page: null }) },
    f.sup && { key: "sup", text: `Supervisor: ${f.sup}`, clear: () => set({ sup: null, page: null }) },
    f.stage && { key: "stage", text: `Gmail stage: ${stageLabel}`, clear: () => set({ stage: null, page: null }) },
    f.src && { key: "src", text: `Source: ${srcLabel}`, clear: () => set({ src: null, page: null }) },
    (f.from || f.to) && { key: "added", text: `Added ${addedText}`, clear: () => set({ from: null, to: null, page: null }) },
    quick && { key: "quick", text: quick.label, clear: () => set({ quick: null, page: null }) },
  ].filter(Boolean) as { key: string; text: string; clear: () => void }[];
  const panelCount = chips.length;

  const columns: Column<CompanyListItem>[] = [
    { key: "name", header: "Registered name", sortValue: (c) => c.name, className: "min-w-[14rem] max-w-[17rem] max-md:max-w-[12rem]", render: (c) => {
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
    { key: "svc", header: "Accounting service", desktopOnly: true, render: (c) => c.acctgService ?? <span className="text-muted-foreground">{DASH}</span> },
    { key: "source", header: "Source", desktopOnly: true, render: (c) => <SourceBadges company={c} /> },
    { key: "ent", header: "Intercompany", desktopOnly: true, sortValue: (c) => c.entities.join(","), render: (c) => c.entities.length ? c.entities.map((e) => <EntityTag key={e}>{e}</EntityTag>) : <span className="text-muted-foreground">{DASH}</span> },
    { key: "added", header: "Date added", desktopOnly: true, sortValue: (c) => c.createdAt, className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (c) => day(c.createdAt) },
    { key: "checked", header: "Last checked", desktopOnly: true, wideOnly: true, sortValue: (c) => c.lastCheckedBilling, className: "whitespace-nowrap", render: (c) => {
      const d = daysSince(c.lastCheckedBilling);
      const stale = d === null || d >= 90;
      return <span className={cn("tabular-nums", stale ? "font-semibold text-warning" : "text-muted-foreground")}>{d === null ? "Never" : ago(c.lastCheckedBilling)}</span>;
    } },
    { key: "last", header: "Last contact", desktopOnly: true, wideOnly: true, sortValue: (c) => c.gmail.lastContact, className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (c) => ago(c.gmail.lastContact) },
  ];

  return (
    <PageShell>
      <PageHeader title="Clients" description={<>The accounting master list. The Scraper reads these clients and contacts to tag Gmail.<span className="mt-2 flex"><MasterUploadNote upload={counts?.lastMasterUpload} /></span></>}
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

      <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-9 gap-2 border-input" />}>
            <SlidersHorizontal aria-hidden className="size-4" />Filters
            {panelCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">{panelCount}</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[min(36rem,var(--available-height))] w-[min(26rem,calc(100vw-2rem))] gap-4 overflow-y-auto p-4">
            <FilterSelect label="Intercompany" value={f.ent} onChange={(v) => set({ ent: v || null, page: null })} options={any("Any intercompany", ENTITIES)} />
            <FilterSelect label="Accounting service" value={f.svc} onChange={(v) => set({ svc: v || null, page: null })} options={any("Any accounting service", services)} />
            <FilterSelect label="Supervisor" value={f.sup} onChange={(v) => set({ sup: v || null, page: null })} options={any("Any supervisor", supervisors)} />
            <FilterSelect label="Gmail stage" value={f.stage} onChange={(v) => set({ stage: v || null, page: null })}
              options={[{ value: "", label: "Any stage" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })), { value: "none", label: "No Gmail yet" }]} />
            <FilterSelect label="Source" value={f.src} onChange={(v) => set({ src: v || null, page: null })}
              options={[{ value: "", label: "Any source" }, { value: "master", label: "Master list only" }, { value: "scraper", label: "Has Scraper contacts" }, { value: "probity", label: "In Probity" }]} />
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-1.5 text-xs font-bold text-muted-foreground">Date added to the list</legend>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">From
                <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value || null, page: null })} className="field-input h-9" /></label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">To
                <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value || null, page: null })} className="field-input h-9" /></label>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-bold text-muted-foreground">Needs attention</legend>
              <div className="flex flex-wrap gap-2">
                {QUICK.filter((x) => x.panel).map(({ key, label, icon: Icon }) => {
                  const count = data?.chipCounts[key] ?? 0;
                  const on = f.quick === key;
                  return (
                    <Button key={key} size="sm" variant="outline" aria-pressed={on} disabled={!count && !on} onClick={() => set({ quick: on ? null : key, page: null })}
                      className={cn("h-8 rounded-full bg-muted/40 font-normal", on && PILL_ON)}>
                      <Icon aria-hidden className="size-3.5" />{label}
                      <span className={cn("rounded-full px-1.5 text-xs tabular-nums", !on && "bg-accent")}>{count}</span>
                    </Button>
                  );
                })}
              </div>
            </fieldset>
            {filtering && <Button variant="ghost" size="sm" className="self-start" onClick={clearAll}><X />Clear all</Button>}
          </PopoverContent>
        </Popover>
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={c.clear} aria-label={`Remove filter ${c.text}`}
            className="group/chip inline-flex h-8 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] px-3 text-xs font-semibold text-primary-text transition-transform outline-none hover:-translate-y-0.5 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            {c.text}<X aria-hidden className="size-3" />
          </button>
        ))}
        {filtering && <Button variant="ghost" size="sm" className="h-8" onClick={clearAll}><X />Clear all</Button>}
      </div>

      <DataTableCard title="Clients" rows={rows} columns={columns} getRowId={(c) => c.id} itemLabel="clients"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        paged={{ total: data?.total ?? 0, all: data?.all ?? 0, settled: !!data && !isPlaceholderData }}
        onRowClick={(c) => set({ id: c.id })} rowLabel={(c) => `Open ${c.name}`}
        rowClassName={(c) => (c.id === openId ? "[&>td]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]" : undefined)}
        sort={sort} onSortChange={(s) => set({ sort: s ? `${s.key}:${s.dir}` : null, page: null })}
        page={page} onPageChange={(p) => set({ page: p === 1 ? null : p })} size={size} onSizeChange={(s) => set({ size: s === 25 ? null : s, page: null })}
        search={<TableSearch slashFocus value={qInput} placeholder="Search name, alias, TIN, email" onChange={setQInput} />}
        empty={filtering
          ? <EmptyState icon={SearchX} title="No clients match these filters." actionLabel="Clear filters" onAction={clearAll} />
          : <EmptyState icon={FileSpreadsheet} title="No clients yet." description={canImport ? "Import the clients workbook, or add the first client by hand." : "Add the first client by hand."}
              actionLabel={canImport ? "Open Import" : "Add client"} onAction={() => canImport ? router.push("/import") : setAdding(true)} />}
      />

      <ClientSheet id={openId} onClose={() => set({ id: null })} />
      <AddClientDialog open={adding || get("new") === "1"} prefill={{ name: get("name") || undefined, email: get("email") || undefined, contactName: get("contact") || undefined }}
        onOpenChange={(o) => { setAdding(o); if (!o && get("new")) set({ new: null, name: null, email: null, contact: null }); }}
        onCreated={(id) => set({ id, new: null, name: null, email: null, contact: null })} />
    </PageShell>
  );
}

const PILL_ON = "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text";

function any(label: string, values: readonly string[]) {
  return [{ value: "", label }, ...values.map((v) => ({ value: v, label: v }))];
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field-select h-9 w-full font-normal">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
