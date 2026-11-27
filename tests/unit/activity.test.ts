import { expect, it } from "vitest";
import { gmailRollup, mergeActivity } from "@/services/activity.service";
import type { CandidateItem } from "@/lib/api-types";
import type { Field, TimelineItem } from "@/lib/candidate-types";
function field<T>(value: T): Field<T> { return { value, source: "gmail", confidence: 1 }; }
const item = (raw_item_id: number, date: string | null, snippet: string, mailbox = "sales@example.test"): TimelineItem =>
  ({ raw_item_id, date, snippet, mailbox, stage: "quoted", department: "Sales", amounts: [] });
const timeline = (items: TimelineItem[], truncated = false) => field({ items, truncated });
const candidates: CandidateItem[] = [
  { id: 1, fields: { stage: field("quoted"), last_contact: field("2026-01-02T08:00:00+08:00"), needs_check: field(["Verify quote"]), stage_dates: field({ quoted: "2026-01-01" }),
    amounts: field([{ stage: "quoted", amount: 100, currency: "PHP", date: "2026-01-01", raw_item_id: 1 }]), timeline: field({ items: [], truncated: true }) } },
  { id: 2, fields: { stage: field("paid"), last_contact: field("2026-01-02T01:00:00Z"), needs_check: field(["Verify payment"]), stage_dates: field({ quoted: "2026-01-02", paid: "2026-01-03" }),
    payments: field([{ date: "2026-01-03", amount: 100, currency: "PHP", basis: "stated", raw_item_id: 2 }]) } },
];
it("rolls up distinct candidates by stage and actual contact time", () => {
  expect(gmailRollup([...candidates, candidates[0]])).toEqual({ stage: "paid", lastContact: "2026-01-02T01:00:00Z", needsCheck: ["Verify quote", "Verify payment"], candidateIds: [1, 2] });
  expect(gmailRollup([])).toEqual({ stage: null, lastContact: null, needsCheck: [], candidateIds: [] });
});
it("merges activity without replacing sheet engagement or duplicating linked candidates", () => {
  const result = mergeActivity([...candidates, candidates[0]]);
  expect(result.candidates).toHaveLength(2);
  expect(result.stageDates).toEqual({ quoted: "2026-01-01", paid: "2026-01-03" });
  expect(result.amounts).toHaveLength(1);
  expect(result.payments).toHaveLength(1);
  expect(result.timeline.truncated).toBe(true);
});

it("summarizes distinct emails and recent Gmail subjects from the available timelines", () => {
  const sep = " — ";
  const newest = item(1, "2026-01-02T01:00:00Z", "Quote" + sep + "private" + sep + "body");
  const result = mergeActivity([
    { id: 1, fields: { ...candidates[0].fields, first_contact: field("2026-01-02T08:00:00+08:00"), timeline: timeline([
      newest, item(2, "2026-01-02T08:30:00+08:00", "Invoice" + sep + "private"),
      item(3, null, "Undated" + sep + "private"), item(4, null, "Fourth" + sep + "private"),
    ], true) } },
    { id: 2, fields: { ...candidates[1].fields, first_contact: field("2026-01-02T01:00:00Z"), timeline: timeline([
      { ...newest, snippet: "Repeated raw item" + sep + "private" },
      item(5, "2026-01-01", "Quote" + sep + "duplicate subject"),
      item(6, "2026-01-03", "Sheet row" + sep + "private", ""),
      item(7, "2026-01-03", "body only"), item(8, "2026-01-03", sep.trimStart() + "blank subject body" + sep + "private"),
      item(9, "2026-01-03", " " + sep + "private"),
    ]) } },
  ]);
  expect(result.summary).toEqual({ stage: "paid", firstContact: "2026-01-02T08:00:00+08:00", lastContact: "2026-01-02T01:00:00Z", messages: 9, latestSubjects: ["Quote", "Invoice", "Undated"] });
  expect(result.timeline.items.filter(({ raw_item_id }) => raw_item_id === newest.raw_item_id)).toHaveLength(1);
  expect(result.summary.messages).toBe(result.timeline.items.length);
  expect(result.timeline.truncated).toBe(true);
  expect(mergeActivity([]).summary).toEqual({ stage: null, firstContact: null, lastContact: null, messages: 0, latestSubjects: [] });
});

it("keeps the first copy and collects each non-empty mailbox once", () => {
  const first = { ...item(1, "2026-01-02", "Quote — body"), amounts: [{ amount: 100, currency: "PHP" }] };
  const result = mergeActivity([
    { id: 1, fields: { timeline: timeline([first]) } },
    { id: 2, fields: { timeline: timeline([
      { ...first, raw_item_id: 2, mailbox: "billing@example.test", amounts: [{ amount: 200, currency: "PHP" }] },
      { ...first, raw_item_id: 3 },
      { ...first, raw_item_id: 4, mailbox: "" },
    ]) } },
  ]);

  expect(result.timeline.items).toEqual([{ ...first, mailboxes: ["billing@example.test", "sales@example.test"] }]);
  expect(result.summary.messages).toBe(result.timeline.items.length);
  expect(result.summary.latestSubjects).toEqual(["Quote"]);
});

it.each([
  ["different snippets", item(1, "2026-01-02", "First"), item(2, "2026-01-02", "Second")],
  ["different stages", item(1, "2026-01-02", "Same"), { ...item(2, "2026-01-02", "Same"), stage: "paid" }],
  ["null dates", item(1, null, "Same"), item(2, null, "Same")],
  ["empty snippets", item(1, "2026-01-02", ""), item(2, "2026-01-02", "")],
] as const)("keeps distinct raw items with %s", (_label, first, second) => {
  const result = mergeActivity([{ id: 1, fields: { timeline: timeline([first, second]) } }]);
  expect(result.timeline.items.map(({ raw_item_id }) => raw_item_id)).toEqual([1, 2]);
  expect(result.summary.messages).toBe(2);
});
