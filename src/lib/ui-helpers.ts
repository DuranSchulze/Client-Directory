import type { Payment } from "./candidate-types";

/** Payment totals kept per currency: amounts in different currencies are never added together. Unknown currency stays its own bucket. */
export function paymentTotals(payments: Payment[]): { currency: string | null; amount: number }[] {
  const totals = new Map<string | null, number>();
  for (const p of payments) {
    if (p.amount === null) continue;
    const key = p.currency?.trim().toUpperCase() || null;
    totals.set(key, (totals.get(key) ?? 0) + p.amount);
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

/** Enter/Space opens a row only when the row itself has focus; a nested button or link keeps its own keyboard action. */
export const rowKeyActivates = (e: { key: string; target: unknown; currentTarget: unknown }) =>
  (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget;

/** Seconds left on a reveal, from an absolute expiry, so a suspended or throttled tab still masks on time. */
export const revealSecondsLeft = (expiresAt: number, now = Date.now()) => Math.max(0, Math.ceil((expiresAt - now) / 1000));
