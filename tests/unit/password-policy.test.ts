import { expect, it } from "vitest";
import { temporaryPassword } from "@/lib/auth/password";
import { PASSWORD_RULES, validatePassword } from "@/lib/password-policy";

const email = "someone@example.test";

it.each([
  ["blank", " \t\n "],
  ["length", "Aa1!aaaaaaa"],
  ["length", `Aa1!${"é".repeat(34)}a`],
  ["length", `Aa1!${"a".repeat(69)}`],
  ["length", "Aa1!aaaaaaa\ud800"],
  ["upper", "lowercase123!"],
  ["lower", "UPPERCASE123!"],
  ["digit", "UpperAndLower!"],
  ["symbol", "UpperAndLower123 é"],
  ["email", "NotSOMEONE123!"],
])("reports the first failing %s rule", (id, password) => {
  expect(validatePassword(password, email)).toBe(PASSWORD_RULES.find((rule) => rule.id === id)!.label);
});

it("accepts 12 characters and 72 bytes, including multi-byte input", () => {
  for (const password of ["Aa1!aaaaaaaa", `Aa1!${"a".repeat(68)}`, `Aa1!${"é".repeat(34)}`]) {
    expect(validatePassword(password, email)).toBeNull();
  }
  expect(validatePassword("ABvalidPass1!", "ab@example.test")).toBeNull();
});

it("generates 16-character temporary passwords that satisfy the policy", () => {
  for (let i = 0; i < 20; i++) {
    const password = temporaryPassword(email);
    expect(password).toMatch(/^[!-~]{16}$/);
    expect(validatePassword(password, email)).toBeNull();
  }
});
