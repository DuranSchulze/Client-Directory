export const PASSWORD_RULES = [
  { id: "blank", label: "Password cannot be blank", test: (pw: string) => !!pw.trim() },
  { id: "length", label: "Password must be at least 12 characters and at most 72 UTF-8 bytes", test: (pw: string) =>
    pw.length <= 72 && !/\p{Cs}/u.test(pw) && [...pw].length >= 12 && new TextEncoder().encode(pw).length <= 72 },
  { id: "upper", label: "Password must contain an uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { id: "lower", label: "Password must contain a lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { id: "digit", label: "Password must contain a digit", test: (pw: string) => /[0-9]/.test(pw) },
  { id: "symbol", label: "Password must contain a symbol", test: (pw: string) => /[^\p{L}\p{N}\s]/u.test(pw) },
  { id: "email", label: "Password must not contain the part of your email before @", test: (pw: string, email: string) => {
    const local = email.split("@")[0].toLowerCase();
    return [...local].length < 3 || !pw.toLowerCase().includes(local);
  } },
] as const satisfies ReadonlyArray<{ id: string; label: string; test(pw: string, email: string): boolean }>;

export function validatePassword(pw: string, email: string): string | null {
  return PASSWORD_RULES.find((rule) => !rule.test(pw, email))?.label ?? null;
}
