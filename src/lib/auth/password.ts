import "server-only";
import { randomInt } from "node:crypto";
import { validatePassword } from "@/lib/password-policy";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

export function temporaryPassword(email: string): string {
  let password: string;
  do {
    password = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (validatePassword(password, email) !== null);
  return password;
}
