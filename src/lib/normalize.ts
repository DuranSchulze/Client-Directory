import { parsePhoneNumberFromString } from "libphonenumber-js";

export const EMAIL_RE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;
export const TIN_RE = /^\d{3}-\d{3}-\d{3}-\d{3,5}$/;
const NULL_TOKENS = new Set(["", "N/A", "NA", "-", "TBD", "#REF!"]);
export function nullText(value: unknown): string | null {
  const text = value == null ? "" : String(value).trim();
  return NULL_TOKENS.has(text.toUpperCase()) ? null : text;
}
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/^\s*the\b/, "").replace(/\b(?:inc|corp|corporation|pte|ltd|limited|llc|co|company|opc|pty|plc|gmbh)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
export function normEmail(value: string): string { return value.trim().toLowerCase(); }
export function toE164(value: string): string | null {
  const phone = parsePhoneNumberFromString(value, "PH");
  return phone?.isValid() ? phone.number : null;
}
// Values copied from Scraper merge.FREE_MAIL and master.FREE_MAIL_PROVIDERS.
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "ymail.com"]);
const FREE_MAIL_PROVIDERS = new Set(["yahoo", "ymail", "rocketmail", "hotmail", "outlook", "live", "msn", "gmail", "googlemail", "aol", "icloud", "me", "mac", "proton", "protonmail", "gmx", "mail", "zoho", "yandex"]);
export function isFreeMail(domain: string): boolean {
  domain = domain.trim().toLowerCase();
  return FREE_MAIL.has(domain) || FREE_MAIL_PROVIDERS.has(domain.split(".")[0]);
}
