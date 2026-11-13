import { STAGES } from "@/lib/enums";
import type { Activity, CandidateItem, GmailRollup } from "@/lib/api-types";

export function gmailRollup(input: CandidateItem[]): GmailRollup {
  const candidates = [...new Map(input.map((candidate) => [candidate.id, candidate])).values()];
  let stage: GmailRollup["stage"] = null;
  let lastContact: string | null = null;
  for (const { fields } of candidates) {
    const value = fields.stage?.value;
    if (value && STAGES.includes(value) && (stage === null || STAGES.indexOf(value) > STAGES.indexOf(stage))) stage = value;
    const date = fields.last_contact?.value;
    if (date && Number.isFinite(Date.parse(date)) && (!lastContact || Date.parse(date) > Date.parse(lastContact))) lastContact = date;
  }
  return { stage, lastContact, needsCheck: candidates.flatMap(({ fields }) => fields.needs_check?.value ?? []), candidateIds: candidates.map(({ id }) => id) };
}
export function mergeActivity(input: CandidateItem[]): Activity {
  const candidates = [...new Map(input.map((candidate) => [candidate.id, candidate])).values()];
  const rollup = gmailRollup(candidates);
  const stageDates: Activity["stageDates"] = {};
  for (const { fields } of candidates) for (const stage of STAGES) {
    const date = fields.stage_dates?.value[stage];
    if (date && Number.isFinite(Date.parse(date)) && (!stageDates[stage] || Date.parse(date) < Date.parse(stageDates[stage]!))) stageDates[stage] = date;
  }
  return { candidates, stage: rollup.stage, stageDates, needsCheck: rollup.needsCheck,
    amounts: candidates.flatMap(({ fields }) => fields.amounts?.value ?? []),
    payments: candidates.flatMap(({ fields }) => fields.payments?.value ?? []),
    timeline: { items: candidates.flatMap(({ fields }) => fields.timeline?.value.items ?? []).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
      truncated: candidates.some(({ fields }) => fields.timeline?.value.truncated ?? false) } };
}
