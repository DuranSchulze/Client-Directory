import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { validatePassword } from "@/lib/password-policy";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

export function temporaryPassword(email: string): string;
export function temporaryPassword(): string {
  let password: string;
  do {
    password = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (validatePassword(password) !== null);
  return password;
}

function temporaryPasswordKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(secret).update("directory-temporary-password").digest();
}

export function encryptTemp(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", temporaryPasswordKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptTemp(value: string): string | null {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length <= 28) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", temporaryPasswordKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
