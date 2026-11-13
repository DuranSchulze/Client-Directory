import { describe, expect, it } from "vitest";
import { paymentTotals, revealSecondsLeft, rowKeyActivates } from "@/lib/ui-helpers";

describe("rowKeyActivates", () => {
  it("opens a focused row but leaves Enter/Space on nested buttons and links alone", () => {
    const row = {}, editButton = {}, link = {};
    expect(rowKeyActivates({ key: "Enter", target: row, currentTarget: row })).toBe(true);
    expect(rowKeyActivates({ key: " ", target: row, currentTarget: row })).toBe(true);
    expect(rowKeyActivates({ key: "Enter", target: editButton, currentTarget: row })).toBe(false);
    expect(rowKeyActivates({ key: "Enter", target: link, currentTarget: row })).toBe(false);
    expect(rowKeyActivates({ key: "a", target: row, currentTarget: row })).toBe(false);
  });
});
import { diffDraft } from "@/components/clients/company-form";
import { validateCompanyDraft } from "@/components/clients/company-fields";
import type { CompanyValues } from "@/lib/api-types";

describe("paymentTotals", () => {
  it("never adds different currencies together and keeps unknown currency apart", () => {
    const totals = paymentTotals([
      { date: null, amount: 100, currency: "PHP", basis: "stated", raw_item_id: 1 },
      { date: null, amount: 100, currency: "USD", basis: "stated", raw_item_id: 2 },
      { date: null, amount: 50, currency: "php", basis: "invoice", raw_item_id: 3 },
      { date: null, amount: 7, currency: null, basis: "unknown", raw_item_id: 4 },
      { date: null, amount: null, currency: "PHP", basis: "unknown", raw_item_id: 5 },
    ]);
    expect(totals).toEqual([{ currency: "PHP", amount: 150 }, { currency: "USD", amount: 100 }, { currency: null, amount: 7 }]);
  });
});

describe("revealSecondsLeft", () => {
  it("expires by elapsed time even when the tab was suspended past the window", () => {
    const start = 1_000_000;
    expect(revealSecondsLeft(start + 30_000, start)).toBe(30);
    expect(revealSecondsLeft(start + 30_000, start + 29_100)).toBe(1);
    expect(revealSecondsLeft(start + 30_000, start + 95_000)).toBe(0);
  });
});

describe("editing an existing company", () => {
  it("does not let an untouched imported SI email list block an unrelated change", () => {
    const original = { name: "Sample Trading Inc.", siEmail: "billing@example.test, accounts@example.test", supervisor: "A. Cruz" } as unknown as CompanyValues;
    const changed = diffDraft(original, { ...original, supervisor: "B. Reyes" });
    expect(changed).toEqual({ supervisor: "B. Reyes" });
    expect(validateCompanyDraft({ ...changed, name: original.name })).toEqual({});
    // The same list is still rejected when the admin actually edits that field.
    expect(validateCompanyDraft({ siEmail: "billing@example.test, accounts@example.test" })).toHaveProperty("siEmail");
  });
});
