"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { errorMessage, request } from "@/lib/api/http";
import { keys } from "@/lib/api/queries";
import type { ImportBuckets, ImportCommitResponse, ImportPreview, ImportPreviewResponse, ImportResult } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const BUCKETS: { key: keyof ImportBuckets; label: string; what: string; warn: boolean }[] = [
  { key: "checkContacts", label: "Check contacts", what: "Contact names, emails and billing roles did not line up; emails were extracted, the first one made main.", warn: true },
  { key: "sharedEmails", label: "Emails under two clients", what: "The first row keeps the email; later rows skip it.", warn: true },
  { key: "invalidEmails", label: "Invalid emails", what: "Dropped from the import. Fix them in the sheet or add them by hand.", warn: true },
  { key: "internalEmails", label: "Internal addresses", what: "Department mailboxes found on client rows; never added as client contacts.", warn: true },
  { key: "invalidValues", label: "Invalid values", what: "Cells that failed a rule (TIN, date, link) and were left empty.", warn: true },
  { key: "rowsWithoutEmail", label: "Rows without email", what: "Imported without contacts.", warn: false },
  { key: "mergedSpellings", label: "Merged spellings", what: "Rows with the same normalized name; later rows fill the first.", warn: false },
  { key: "unmatchedHeaders", label: "Unmatched headers", what: "Columns the import does not read.", warn: false },
];
const TABLES = [["companies", "Clients"], ["contacts", "Contacts"], ["probity", "Probity rows"], ["suppliers", "Suppliers"], ["deptEmails", "Dept. emails"]] as const;

type Step = { kind: "pick" } | { kind: "checking"; file: File } | { kind: "preview"; file: File; preview: ImportPreview } | { kind: "committing"; file: File; preview: ImportPreview } | { kind: "done"; result: ImportResult };

export function ImportView() {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Import"
        description="Reads the four tabs of the clients workbook: All Clients Database, Probity Clients, OPS Supplier and All Dept. Emails. You see a preview before anything is saved; re-importing only fills empty fields, so edits made here win." />
      <section aria-label="Workbook import" className="flex flex-col rounded-2xl bg-card pt-5">
        <ImportBody step={step} setStep={setStep} />
      </section>
    </div>
  );
}

function ImportBody({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  async function check(file: File) {
    if (!/\.xlsx$/i.test(file.name)) { toast.error("Choose an .xlsx file."); return; }
    setStep({ kind: "checking", file });
    const body = new FormData(); body.set("file", file); body.set("check", "1");
    try {
      const r = await request<ImportPreviewResponse>("/api/import/xlsx", { body });
      setStep({ kind: "preview", file, preview: r.preview });
    } catch (e) { toast.error(errorMessage(e)); setStep({ kind: "pick" }); }
  }
  async function commit(file: File, preview: ImportPreview) {
    setStep({ kind: "committing", file, preview });
    const body = new FormData(); body.set("file", file);
    try {
      const r = await request<ImportCommitResponse>("/api/import/xlsx", { body });
      await Promise.all([keys.companies, keys.counts, keys.probity, keys.suppliers, keys.deptEmails, keys.needsCompany].map((queryKey) => qc.invalidateQueries({ queryKey })));
      toast.success("Import saved");
      setStep({ kind: "done", result: r.result });
    } catch (e) { toast.error(errorMessage(e)); setStep({ kind: "preview", file, preview }); }
  }

  if (step.kind === "pick" || step.kind === "checking") {
    const checking = step.kind === "checking";
    return (
      <div className="px-5 pb-5">
        <div role="button" tabIndex={0} aria-disabled={checking} aria-label="Choose the workbook to import"
          onClick={() => !checking && input.current?.click()}
          onKeyDown={(e) => { if (!checking && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !checking) check(f); }}
          className={cn("group flex flex-col items-center gap-3 rounded-xl bg-sunk px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring dark:bg-field",
            drag ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--sunk))]" : "hover:bg-lift")}>
          <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text transition-transform group-hover:scale-105">
            {checking ? <FileSpreadsheet className="size-5 animate-pulse" /> : <Upload className="size-5" />}
          </span>
          <span className="text-sm font-semibold">{checking ? `Checking ${step.file.name}…` : "Drop the .xlsx here, or click to choose it"}</span>
          <span className="text-xs text-muted-foreground">Up to 10 MB. Nothing is saved at this step.</span>
        </div>
        <input ref={input} type="file" accept=".xlsx" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) check(f); }} />
      </div>
    );
  }

  const summary = step.kind === "done" ? { changes: step.result.changes, probity: step.result.probity, buckets: step.result.buckets } : step.preview;
  const committing = step.kind === "committing";
  return (
    <>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-4">
        {step.kind === "done"
          ? <p className="flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-3 py-2.5 text-sm font-semibold text-success"><CircleCheck className="size-4" />Saved. The Scraper picks up new contacts on its next scrape run.</p>
          : <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{step.file.name}</span> · {step.preview.rows.companies.toLocaleString()} rows, {step.preview.companies.toLocaleString()} clients after merging spellings.</p>}
        <div className="overflow-x-auto rounded-xl bg-sunk p-3 dark:bg-accent/60">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-1.5 font-semibold">Table</th><th className="pb-1.5 text-right font-semibold">New</th><th className="pb-1.5 text-right font-semibold">Filled in</th></tr></thead>
            <tbody>
              {TABLES.map(([k, label]) => (
                <tr key={k}><td className="py-1">{label}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{summary.changes[k].inserted.toLocaleString()}</td>
                  <td className="py-1 text-right tabular-nums">{summary.changes[k].updated.toLocaleString()}</td></tr>
              ))}
              <tr><td className="pt-2">Probity matched</td><td colSpan={2} className="pt-2 text-right tabular-nums">
                <span className="font-semibold">{summary.probity.matched}</span> matched · <span className={cn("font-semibold", summary.probity.notFound && "text-warning")}>{summary.probity.notFound} not found</span>
              </td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5">
          {BUCKETS.map((b) => {
            const items = summary.buckets[b.key];
            if (!items.length) return null;
            return (
              <details key={b.key} open={b.warn && items.length <= 20} className="group rounded-xl bg-sunk dark:bg-accent/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
                  {b.warn && <TriangleAlert aria-hidden className="size-4 text-warning" />}{b.label}
                  <span className="ml-auto rounded-full bg-accent px-2 text-xs tabular-nums">{items.length}</span>
                </summary>
                <div className="px-3 pb-3">
                  <p className="mb-2 text-xs text-muted-foreground">{b.what}</p>
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px]">
                    {items.slice(0, 200).map((it, i) => (
                      <li key={i} className="flex gap-2"><span className="shrink-0 text-muted-foreground tabular-nums">{it.sheet} · row {it.row}</span><span className="min-w-0 break-words">{it.reason}</span></li>
                    ))}
                    {items.length > 200 && <li className="text-muted-foreground">and {items.length - 200} more</li>}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl bg-sunk px-5 py-3 dark:bg-accent/40">
        {step.kind === "done" ? <Button variant="secondary" onClick={() => setStep({ kind: "pick" })}>Import another file</Button> : <>
          <Button variant="ghost" disabled={committing} onClick={() => setStep({ kind: "pick" })}>Choose another file</Button>
          <Button disabled={committing} onClick={() => commit(step.file, step.preview)}>{committing ? "Saving…" : "Save import"}</Button>
        </>}
      </div>
    </>
  );
}
