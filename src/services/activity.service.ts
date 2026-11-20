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
  let firstContact: string | null = null;
  for (const { fields } of candidates) {
    const date = fields.first_contact?.value;
    if (date && Number.isFinite(Date.parse(date)) && (!firstContact || Date.parse(date) < Date.parse(firstContact))) firstContact = date;
  }
  const items = candidates.flatMap(({ fields }) => fields.timeline?.value.items ?? []);
  const subjectDate = (date: string | null) => {
    const time = date ? Date.parse(date) : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  const latestSubjects = new Set<string>();
  const separator = " — ";
  for (const { mailbox, snippet } of [...items].sort((a, b) => subjectDate(b.date) - subjectDate(a.date))) {
    const end = snippet?.indexOf(separator);
    // Scraper trims the whole snippet, so a blank subject can start with a bare separator.
    if (!mailbox || !snippet || end <= 0 || /^—(?:\s|$)/.test(snippet)) continue;
    const subject = snippet.slice(0, end).trim();
    if (subject) latestSubjects.add(subject);
    if (latestSubjects.size === 3) break;
  }
  return { candidates, stage: rollup.stage, stageDates, needsCheck: rollup.needsCheck,
    summary: { stage: rollup.stage, firstContact, lastContact: rollup.lastContact, messages: new Set(items.map((item) => item.raw_item_id)).size, latestSubjects: [...latestSubjects] },
    amounts: candidates.flatMap(({ fields }) => fields.amounts?.value ?? []),
    payments: candidates.flatMap(({ fields }) => fields.payments?.value ?? []),
    timeline: { items: items.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
      truncated: candidates.some(({ fields }) => fields.timeline?.value.truncated ?? false) } };
}
