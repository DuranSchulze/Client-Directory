import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptAccountNo, encryptAccountNo } from "@/lib/crypto/account-no";

beforeEach(() => vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());
describe("account number encryption", () => {
  it("round trips leading zeroes with a fresh IV for each write", () => {
    const ciphertext = encryptAccountNo("001234567890");
    expect(decryptAccountNo(ciphertext)).toBe("001234567890");
    expect(ciphertext).not.toContain("001234567890");
    expect(encryptAccountNo("001234567890")).not.toBe(ciphertext);
    expect(ciphertext.split(":")).toHaveLength(3);
  });
  it.each([0, 1, 2])("rejects a tampered part %i", (index) => {
    const parts = encryptAccountNo("001234567890").split(":");
    const part = Buffer.from(parts[index], "base64");
    part[0] ^= 1;
    parts[index] = part.toString("base64");
    expect(() => decryptAccountNo(parts.join(":"))).toThrow();
  });
  it("rejects malformed ciphertext, a wrong key and invalid key lengths", () => {
    expect(() => decryptAccountNo("bad")).toThrow();
    const ciphertext = encryptAccountNo("001234");
    vi.stubEnv("ACCOUNT_NO_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptAccountNo(ciphertext)).toThrow();
    for (const value of ["", "invalid", Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64")]) {
      vi.stubEnv("ACCOUNT_NO_KEY", value);
      expect(() => encryptAccountNo("001234")).toThrow("ACCOUNT_NO_KEY");
    }
  });
});
