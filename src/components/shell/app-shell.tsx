"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Building2, Contact, Inbox, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sun, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { countsQuery, meQuery } from "@/lib/api/queries";
import { errorMessage, request } from "@/lib/api/http";
import type { Counts } from "@/lib/api-types";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Badge = { value: number; hot: boolean } | null;
const NAV: { href: string; label: string; icon: React.ElementType; badge: (c?: Counts) => Badge }[] = [
  { href: "/clients", label: "Clients", icon: Building2, badge: (c) => c ? { value: c.companies, hot: false } : null },
  // Probity shows unmatched rows when there are any, else the total.
  { href: "/probity", label: "Probity", icon: ShieldCheck, badge: (c) => c ? (c.probityUnmatched ? { value: c.probityUnmatched, hot: true } : { value: c.probity, hot: false }) : null },
  { href: "/needs-company", label: "Needs company", icon: Inbox, badge: (c) => c ? { value: c.needsCompany, hot: c.needsCompany > 0 } : null },
  { href: "/suppliers", label: "OPS suppliers", icon: Truck, badge: (c) => c ? { value: c.suppliers, hot: false } : null },
  { href: "/dept-emails", label: "Dept. emails", icon: Contact, badge: (c) => c ? { value: c.deptEmails, hot: false } : null },
];

const COLLAPSE_KEY = "directory.sidebar.collapsed";
const COLLAPSE_EVENT = "directory:sidebar";
const isCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";
const subscribeCollapse = (cb: () => void) => {
  window.addEventListener(COLLAPSE_EVENT, cb);
  return () => window.removeEventListener(COLLAPSE_EVENT, cb);
};
function toggleCollapsed() {
  const next = !isCollapsed();
  document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
  try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

const ROW = "group/row relative flex h-9 w-full items-center rounded-lg text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const SLOT = "flex w-12 shrink-0 items-center justify-center";
const ICON = "size-[1.125rem] shrink-0";
const IDLE = "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";
const ITEM = "flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-accent [&_svg]:size-4 [&_svg]:shrink-0";

function SidebarContent({ tip, collapsed, showCollapse, onNavigate, onLogout }: {
  tip: boolean; collapsed: boolean; showCollapse: boolean; onNavigate?: () => void; onLogout: () => void;
}) {
  const theme = useTheme();
  const pathname = usePathname();
  const { data: me } = useQuery(meQuery);
  const { data: counts } = useQuery(countsQuery);
  const name = me?.name ?? "Account";
  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-2">
        <span className={SLOT}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Building2 className="size-4" /></span>
        </span>
        <span className="sb-label min-w-0 flex-1 truncate pr-2 text-[15px] font-bold tracking-tight whitespace-nowrap">Client Directory</span>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2 py-2">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const b = badge(counts);
          return (
            <Tooltip key={href} disabled={!tip}>
              <TooltipTrigger render={
                <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cn(ROW, active ? "bg-sidebar-accent text-sidebar-accent-foreground" : IDLE)} />
              }>
                {active && <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />}
                <span className={cn(SLOT, "relative")}>
                  <Icon className={cn(ICON, active && "text-primary-text")} />
                  {b?.hot && <span aria-hidden className="absolute top-0.5 right-2.5 size-2 rounded-full bg-primary not-in-data-[sidebar=collapsed]:hidden max-lg:hidden" />}
                </span>
                <span className="sb-label flex min-w-0 flex-1 items-center gap-2 pr-2 whitespace-nowrap">
                  <span className="truncate">{label}</span>
                  {b && (
                    <span className={cn("ml-auto rounded-full px-1.5 text-xs tabular-nums",
                      b.hot ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] font-bold text-primary-text" : "font-semibold text-muted-foreground")}>
                      <span className="sr-only">{b.hot ? "needs attention: " : "count: "}</span>{b.value > 9999 ? "9999+" : b.value.toLocaleString()}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>{label}{b ? ` · ${b.value}` : ""}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      {showCollapse && (
        <div className="px-2 pb-2">
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className={cn(ROW, IDLE)}>
            <span className={SLOT}>
              <PanelLeftClose className={cn("sb-icon-expanded", ICON)} />
              <PanelLeftOpen className={cn("sb-icon-collapsed", ICON)} />
            </span>
            <span className="sb-label pr-2 whitespace-nowrap">Collapse sidebar</span>
          </button>
        </div>
      )}
      <div className="p-2">
        <div className="flex items-center rounded-lg bg-sidebar-accent/60">
          <MenuPrimitive.Root>
            <MenuPrimitive.Trigger aria-label={`Account menu for ${name}`}
              className={cn(ROW, "h-12 min-w-0 flex-1 text-left font-medium text-sidebar-foreground hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent")}>
              <span className={SLOT}>
                <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold uppercase">{name.slice(0, 2)}</span>
              </span>
              <span className="sb-label min-w-0 flex-1 pr-2 leading-tight whitespace-nowrap">
                <span className="block truncate text-sm font-semibold">{name}</span>
                <span className="block truncate text-xs text-sidebar-foreground/70">{me ? `${me.role} · ${me.email}` : "Signed in"}</span>
              </span>
            </MenuPrimitive.Trigger>
            <MenuPrimitive.Portal>
              <MenuPrimitive.Positioner side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} sideOffset={8} className="isolate z-50">
                <MenuPrimitive.Popup className="min-w-56 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
                  {collapsed && (
                    <MenuPrimitive.Item onClick={toggleTheme} className={ITEM}>
                      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}{theme === "dark" ? "Light mode" : "Dark mode"}
                    </MenuPrimitive.Item>
                  )}
                  <MenuPrimitive.Item onClick={onLogout} className={cn(ITEM, "text-destructive data-highlighted:bg-destructive/10")}>
                    <LogOut aria-hidden />Sign out
                  </MenuPrimitive.Item>
                </MenuPrimitive.Popup>
              </MenuPrimitive.Positioner>
            </MenuPrimitive.Portal>
          </MenuPrimitive.Root>
          <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:translate-y-px in-data-[sidebar=collapsed]:lg:hidden">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapse, isCollapsed, () => false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { document.documentElement.dataset.sidebarReady = ""; }));
    return () => cancelAnimationFrame(id);
  }, []);

  // Another tab signed in or out: reload so this tab never shows the previous account's cached data.
  useEffect(() => {
    let ch: BroadcastChannel;
    try { ch = new BroadcastChannel("directory-session"); } catch { return; }
    ch.onmessage = () => window.location.reload();
    return () => ch.close();
  }, []);

  async function logout() {
    setSigningOut(true);
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (e) {
      toast.error(`Could not sign out: ${errorMessage(e)}`);
      setSigningOut(false);
      return;
    }
    try { new BroadcastChannel("directory-session").postMessage("out"); } catch { /* unsupported */ }
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen">
      <div aria-hidden className="sb-spacer hidden shrink-0 lg:block" />
      <aside aria-label="Sidebar" className="sb-aside fixed inset-y-0 left-0 z-40 hidden lg:block">
        <div className="h-full overflow-hidden bg-sidebar">
          <SidebarContent tip={collapsed} collapsed={collapsed} showCollapse onLogout={() => setConfirm(true)} />
        </div>
      </aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 border-0 bg-sidebar p-0 lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <SidebarContent tip={false} collapsed={false} showCollapse={false} onNavigate={() => setDrawer(false)} onLogout={() => { setDrawer(false); setConfirm(true); }} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-background/85 px-4 backdrop-blur lg:hidden">
          <Button size="icon" variant="ghost" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu className="size-5" /></Button>
          <span className="text-sm font-bold tracking-tight">Client Directory</span>
        </header>
        <main className="flex-1 px-4 pt-4 pb-10 lg:px-10 lg:pt-8 [contain:inline-size]">{children}</main>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Sign out?" confirmLabel="Sign out" pendingLabel="Signing out…" pending={signingOut}
        description="You will need your email and password to sign back in." onConfirm={logout} />
    </div>
  );
}
