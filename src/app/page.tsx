import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/access";

export default async function Home() {
  const user = await requireActiveUser().catch(() => null);
  redirect(user ? homeFor(user.routes) : "/login");
}
