import type { Payment } from "./candidate-types";

/** Totals kept per currency: amounts in different currencies are never added together. Unknown currency stays its own bucket. */
export function currencyTotals(items: { amount: number | null; currency: string | null }[]): { currency: string | null; amount: number }[] {
  const totals = new Map<string | null, number>();
  for (const item of items) {
    if (item.amount === null) continue;
    const key = item.currency?.trim().toUpperCase() || null;
    totals.set(key, (totals.get(key) ?? 0) + item.amount);
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

export function paymentTotals(payments: Payment[]): { currency: string | null; amount: number }[] {
  return currencyTotals(payments);
}

export const isConfirmedPayment = (p: Pick<Payment, "basis">) => p.basis === "stated" || p.basis === "manual";

/** Enter/Space opens a row only when the row itself has focus; a nested button or link keeps its own keyboard action. */
export const rowKeyActivates = (e: { key: string; target: unknown; currentTarget: unknown }) =>
  (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget;

/** Seconds left on a reveal, from an absolute expiry, so a suspended or throttled tab still masks on time. */
export const revealSecondsLeft = (expiresAt: number, now = Date.now()) => Math.max(0, Math.ceil((expiresAt - now) / 1000));
