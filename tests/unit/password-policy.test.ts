import { afterEach, expect, it, vi } from "vitest";
import { decryptTemp, encryptTemp, temporaryPassword } from "@/lib/auth/password";
import { PASSWORD_RULES, validatePassword } from "@/lib/password-policy";

const email = "someone@example.test";
afterEach(() => vi.unstubAllEnvs());

it.each([
  [" \t\n ", "Enter a password."],
  ["Aa1!aaaaaaa", "Use at least 12 characters."],
  [`Aa1!${"é".repeat(34)}a`, "This password is too long. Try a shorter one."],
  [`Aa1!${"a".repeat(69)}`, "This password is too long. Try a shorter one."],
  ["Aa1!aaaaaaa\ud800", "This password contains an invalid character."],
  ["lowercase123!", "Add an uppercase letter (A-Z)."],
  ["UPPERCASE123!", "Add a lowercase letter (a-z)."],
  ["UpperAndLower!", "Add a number (0-9)."],
  ["UpperAndLower123 é", "Add a symbol, such as ! # or @."],
])("returns a plain error for %j", (password, error) => {
  expect(validatePassword(password)).toBe(error);
});

it("accepts 12 characters and 72 bytes, including multi-byte input", () => {
  for (const password of ["Aa1!aaaaaaaa", `Aa1!${"a".repeat(68)}`, `Aa1!${"é".repeat(34)}`, "Someone1234!"]) {
    expect(validatePassword(password)).toBeNull();
  }
  expect(PASSWORD_RULES.map(({ id, label }) => [id, label])).toEqual([
    ["length", "At least 12 characters"], ["upper", "An uppercase letter (A-Z)"], ["lower", "A lowercase letter (a-z)"],
    ["digit", "A number (0-9)"], ["symbol", "A symbol, such as ! # or @"],
  ]);
});

it("generates 16-character temporary passwords that satisfy the policy", () => {
  for (let i = 0; i < 20; i++) {
    const password = temporaryPassword(email);
    expect(password).toMatch(/^[!-~]{16}$/);
    expect(validatePassword(password)).toBeNull();
  }
});

it("encrypts with a fresh IV and authenticates the stored credential", () => {
  vi.stubEnv("SESSION_SECRET", "first-test-secret-at-least-32-characters");
  const password = "Temporary1234!";
  const encrypted = encryptTemp(password);
  expect(decryptTemp(encrypted)).toBe(password);
  expect(encryptTemp(password)).not.toBe(encrypted);
  const bytes = Buffer.from(encrypted, "base64");
  bytes[12] ^= 1;
  expect(decryptTemp(bytes.toString("base64"))).toBeNull();
  vi.stubEnv("SESSION_SECRET", "second-test-secret-at-least-32-characters");
  expect(decryptTemp(encrypted)).toBeNull();
});
