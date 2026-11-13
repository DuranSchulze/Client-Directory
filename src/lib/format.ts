// Display helpers. Missing values render as an em dash, never blank.
export const DASH = "—";

const dateFmt = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
const stampFmt = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** "Aug 14, 2020" from YYYY-MM-DD or ISO. */
export function day(value?: string | null): string {
  if (!value) return DASH;
  const d = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

export function stamp(value?: string | null): string {
  if (!value) return DASH;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : stampFmt.format(d);
}

/** Whole days since a date; null when unknown. */
export function daysSince(value?: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00+08:00` : value);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function ago(value?: string | null): string {
  const d = daysSince(value);
  if (d === null) return DASH;
  if (d === 0) return "today";
  if (d < 60) return `${d}d ago`;
  if (d < 730) return `${Math.round(d / 30)} mo ago`;
  return `${Math.round(d / 365)} yr ago`;
}

export const money = (a: { amount: number | null; currency: string | null }) =>
  a.amount === null ? DASH : `${a.currency ?? ""} ${Number(a.amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`.trim();

export const orDash = (v?: string | null) => (v && v.trim() ? v : DASH);

export const initials = (name?: string | null) =>
  (name ?? "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** Split a free-text list (commas, slashes, new lines) into trimmed items. */
export const splitList = (s: string) => s.split(/[,;/\n]+/).map((x) => x.trim()).filter(Boolean);
