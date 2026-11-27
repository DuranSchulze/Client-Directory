import { redirect } from "next/navigation";
import { requireVerifiedUser, sessionUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/access";

export default async function Home() {
  const user = await requireVerifiedUser().catch(() => null);
  if (user?.mustChangePassword) redirect("/change-password");
  redirect(user ? homeFor(sessionUser(user).routes) : "/login");
}
