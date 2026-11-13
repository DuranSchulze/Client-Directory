import { Suspense } from "react";
import { Building2, FileSpreadsheet, Inbox, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Client Directory" };

const POINTS = [
  { icon: FileSpreadsheet, title: "One master list", text: "The All Clients Database sheet, imported once and edited here." },
  { icon: Inbox, title: "Gmail beside each client", text: "Approved Scraper conversations, matched by contact email." },
  { icon: ShieldCheck, title: "Bank numbers stay masked", text: "Every reveal is logged with who and when." },
];

export default function Page() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-sidebar p-6 text-sidebar-foreground sm:p-10 lg:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Building2 className="size-[1.15rem]" /></span>
          <span className="text-[0.95rem] font-bold tracking-tight">Client Directory</span>
        </div>
        <div className="relative max-w-xl">
          <h2 className="text-3xl leading-tight font-bold tracking-tight text-balance text-sidebar-accent-foreground sm:text-4xl lg:text-[2.6rem]">
            Accounting clients, contacts and their Gmail history in one list.
          </h2>
          <ul className="mt-8 hidden flex-col gap-5 sm:flex">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground"><Icon className="size-4" /></span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-sidebar-foreground/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-xs text-sidebar-foreground/75 lg:block">Separate sign-in from the Scraper. Admin accounts only.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <Suspense fallback={null}><LoginForm /></Suspense>
      </section>
    </main>
  );
}
