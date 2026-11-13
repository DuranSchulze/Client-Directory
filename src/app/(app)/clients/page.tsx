import { Suspense } from "react";
import { ClientsView } from "@/components/clients/clients-view";

export const metadata = { title: "Clients · Client Directory" };

export default function Page() {
  return <Suspense fallback={null}><ClientsView /></Suspense>;
}
