import "server-only";
import { compare } from "bcryptjs";
import { AppError } from "@/lib/errors";
import { EMAIL_RE, normEmail } from "@/lib/normalize";
import { findUserByEmail } from "@/repositories/users.repository";
import { createSession } from "./session";
import { sessionUser } from "./guard";

const DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
export async function login(body: unknown) {
  if (!body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string" || !EMAIL_RE.test(normEmail(body.email))) {
    throw new AppError(400, "Enter a valid email address", "email");
  }
  if (!("password" in body) || typeof body.password !== "string" || !body.password || new TextEncoder().encode(body.password).length > 72) {
    throw new AppError(400, "Enter a password of at most 72 bytes", "password");
  }
  const user = await findUserByEmail(normEmail(body.email));
  const matches = await compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches || !user.active) throw new AppError(401, "Invalid email or password");
  return { token: await createSession(user.id), item: sessionUser(user) };
}
