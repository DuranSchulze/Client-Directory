const rules = [
  { id: "length", label: "At least 12 characters", error: "Use at least 12 characters.", test: (pw: string) => [...pw].length >= 12 },
  { id: "upper", label: "An uppercase letter (A-Z)", error: "Add an uppercase letter (A-Z).", test: (pw: string) => /[A-Z]/.test(pw) },
  { id: "lower", label: "A lowercase letter (a-z)", error: "Add a lowercase letter (a-z).", test: (pw: string) => /[a-z]/.test(pw) },
  { id: "digit", label: "A number (0-9)", error: "Add a number (0-9).", test: (pw: string) => /[0-9]/.test(pw) },
  { id: "symbol", label: "A symbol, such as ! # or @", error: "Add a symbol, such as ! # or @.", test: (pw: string) => /[^\p{L}\p{N}\s]/u.test(pw) },
];

type PasswordRule = { id: string; label: string; test(pw: string, email?: string): boolean };
export const PASSWORD_RULES: readonly PasswordRule[] = rules.map(({ id, label, test }) => ({ id, label, test }));

export function validatePassword(pw: string): string | null {
  if (!pw.trim()) return "Enter a password.";
  if (pw.length > 72 || new TextEncoder().encode(pw).length > 72) return "This password is too long. Try a shorter one.";
  if (/\p{Cs}/u.test(pw)) return "This password contains an invalid character.";
  return rules.find((rule) => !rule.test(pw))?.error ?? null;
}
