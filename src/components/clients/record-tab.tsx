import type { CompanyDetail } from "@/lib/api-types";
import { DASH, orDash, stamp } from "@/lib/format";
import { Section } from "./client-sheet";

const MATCHED: Record<string, string> = { email: "by contact email", name: "by registered name, alias or trade name", manual: "set by hand" };

export function RecordTab({ detail }: { detail: CompanyDetail }) {
  const c = detail.company;
  return (
    <div>
      <Section title="companies row">
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Client id</dt><dd className="font-mono tabular-nums">{c.id}</dd>
          <dt className="text-muted-foreground">Name key</dt><dd className="font-mono break-all">{c.nameKey}</dd>
          <dt className="text-muted-foreground">Created by</dt><dd>{orDash(c.createdBy)}</dd>
          <dt className="text-muted-foreground">Created</dt><dd className="tabular-nums">{stamp(c.createdAt)}</dd>
          <dt className="text-muted-foreground">Updated</dt><dd className="tabular-nums">{stamp(c.updatedAt)}</dd>
        </dl>
      </Section>
      <Section title="Probity rows matched">
        {detail.probity.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {detail.probity.map((p) => (
              <li key={p.id}>Row {p.id}: <span className="font-semibold">{p.companyListed}</span> <span className="text-muted-foreground">{p.matchedBy ? MATCHED[p.matchedBy] : DASH}</span></li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Account number reveals (last 10)">
        {detail.reveals.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {detail.reveals.map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span>{r.userEmail}</span><span className="text-muted-foreground tabular-nums">{stamp(r.at)}</span></li>)}
          </ul>
        )}
      </Section>
      <Section title="Linked Scraper candidates">
        {detail.activity.candidates.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="flex flex-wrap gap-1.5">
            {detail.activity.candidates.map((x) => <li key={x.id} className="rounded-md bg-card px-2 py-0.5 font-mono text-xs tabular-nums">#{x.id}</li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
