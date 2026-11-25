"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Building2, Contact, FileSpreadsheet, Inbox, LogOut, Menu, MessageSquareText, Moon, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sun, Truck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NoAccess } from "@/components/shell/no-access";
import { countsQuery, keys, meQuery } from "@/lib/api/queries";
import { errorMessage, request } from "@/lib/api/http";
import type { Counts } from "@/lib/api-types";
import type { RouteKey } from "@/lib/routes";
import { routeFor } from "@/lib/access";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Badge = { value: number; hot: boolean } | null;
const none = (): Badge => null;
const NAV: { href: string; label: string; icon: React.ElementType; route: RouteKey; badge: (c?: Counts) => Badge }[] = [
  { href: "/clients", label: "Clients", icon: Building2, route: "directory", badge: (c) => c ? { value: c.companies, hot: false } : null },
  // Probity shows unmatched rows when there are any, else the total.
  { href: "/probity", label: "Probity", icon: ShieldCheck, route: "directory", badge: (c) => c ? (c.probityUnmatched ? { value: c.probityUnmatched, hot: true } : { value: c.probity, hot: false }) : null },
  { href: "/needs-company", label: "Needs company", icon: Inbox, route: "directory", badge: (c) => c ? { value: c.needsCompany, hot: c.needsCompany > 0 } : null },
  { href: "/inquiries", label: "Inquiries", icon: MessageSquareText, route: "directory", badge: (c) => c ? { value: c.inquiries, hot: false } : null },
  { href: "/suppliers", label: "OPS suppliers", icon: Truck, route: "directory", badge: (c) => c ? { value: c.suppliers, hot: false } : null },
  { href: "/dept-emails", label: "Department emails", icon: Contact, route: "directory", badge: (c) => c ? { value: c.deptEmails, hot: false } : null },
  { href: "/import", label: "Import", icon: FileSpreadsheet, route: "import", badge: none },
  { href: "/accounts", label: "Accounts", icon: UsersRound, route: "accounts", badge: none },
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

// Every row keeps its icon in a fixed 3rem slot, so icons never move while the width animates and labels are only clipped.
const ROW = "group/row relative flex h-9 w-full items-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const SLOT = "flex w-12 shrink-0 items-center justify-center";
const ICON = "size-[1.125rem] shrink-0";
const IDLE = "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";
const ITEM = "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";

// Pages are grouped like the Scraper's sidebar; Import and Accounts sit under Admin.
const GROUPS = [{ label: "Directory", admin: false }, { label: "Admin", admin: true }] as const;

function NavRow({ href, label, icon: Icon, active, badge, tip, onNavigate }: {
  href: string; label: string; icon: React.ElementType; active: boolean; badge: Badge; tip: boolean; onNavigate?: () => void;
}) {
  return (
    <Tooltip disabled={!tip}>
      <TooltipTrigger render={
        <Link href={href} onClick={onNavigate} aria-label={label} aria-current={active ? "page" : undefined}
          className={cn(ROW, active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : IDLE)} />
      }>
        {active && <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />}
        <span className={cn(SLOT, "relative")}>
          <Icon className={ICON} />
          {badge?.hot && <span aria-hidden className={cn("absolute top-0.5 right-2 size-2.5 rounded-full bg-primary ring-2 not-in-data-[sidebar=collapsed]:hidden max-lg:hidden", active ? "ring-sidebar-accent" : "ring-sidebar")} />}
        </span>
        <span className="sb-label flex min-w-0 flex-1 items-center gap-2 pr-2 whitespace-nowrap">
          <span className="truncate">{label}</span>
          {badge && (
            <span className={cn("ml-auto rounded-full px-1.5 py-px text-xs tabular-nums",
              badge.hot ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] font-semibold text-primary-text" : "font-semibold text-muted-foreground")}>
              <span className="sr-only">{badge.hot ? "needs attention: " : "count: "}</span>{badge.value > 9999 ? "9999+" : badge.value.toLocaleString()}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}{badge ? ` · ${badge.value}` : ""}</TooltipContent>
    </Tooltip>
  );
}

function SidebarContent({ tip, collapsed, showCollapse, onNavigate, onLogout }: {
  tip: boolean; collapsed: boolean; showCollapse: boolean; onNavigate?: () => void; onLogout: () => void;
}) {
  const theme = useTheme();
  const pathname = usePathname();
  const { data: me } = useQuery(meQuery);
  const { data: counts } = useQuery({ ...countsQuery, enabled: !!me?.routes.includes("directory") });
  const nav = NAV.filter((n) => me?.routes.includes(n.route));
  const groups = GROUPS.map((g) => ({ ...g, items: nav.filter((n) => (n.route === "directory") !== g.admin) })).filter((g) => g.items.length);
  const name = me?.name ?? "Account";
  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center px-2">
        <span className={SLOT}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Building2 className="size-4 shrink-0" /></span>
        </span>
        <span className="sb-label min-w-0 flex-1 truncate pr-2 text-sm font-semibold tracking-tight whitespace-nowrap">Client Directory</span>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-2 py-2">
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="flex flex-col gap-0.5">
            <div className="relative h-7">
              <span aria-hidden className="sb-label absolute inset-y-0 left-3 flex items-center text-xs font-medium whitespace-nowrap text-sidebar-foreground/70">{g.label}</span>
              <span aria-hidden className="sb-icon-collapsed absolute top-1/2 left-4 h-px w-4 bg-sidebar-border" />
            </div>
            {g.items.map(({ href, label, icon, badge }) => (
              <NavRow key={href} href={href} label={label} icon={icon} badge={badge(counts)} tip={tip}
                active={pathname === href || pathname.startsWith(href + "/")} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      {/* A labelled row (not a header icon), so the collapse control is easy to find. It sits above the footer's border line. */}
      {showCollapse && (
        <div className="px-2 pb-2">
          <Tooltip disabled={!tip}>
            <TooltipTrigger render={
              <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
                className={cn(ROW, IDLE)} />
            }>
              <span className={SLOT}>
                <PanelLeftClose className={cn("sb-icon-expanded", ICON)} />
                <PanelLeftOpen className={cn("sb-icon-collapsed", ICON)} />
              </span>
              <span className="sb-label pr-2 whitespace-nowrap">Collapse sidebar</span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>Expand sidebar</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="border-t border-sidebar-border p-2">
        {/* One account card: the menu trigger fills it and the theme button sits inside it (hidden while collapsed; the menu has the same action). */}
        <div className="flex items-center rounded-md">
          <MenuPrimitive.Root>
            {/* Tooltip and menu share one button: the tooltip trigger renders the menu trigger. */}
            <Tooltip disabled={!tip}>
              <TooltipTrigger render={
                <MenuPrimitive.Trigger aria-label={`Account menu for ${name}`}
                  className={cn(ROW, "h-12 min-w-0 flex-1 text-left text-sidebar-foreground hover:bg-sidebar-accent/70 data-popup-open:bg-sidebar-accent")} />
              }>
                <span className={SLOT}>
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground uppercase ring-1 ring-sidebar-border">{name.slice(0, 1)}</span>
                </span>
                <span className="sb-label flex min-w-0 flex-1 items-center gap-2 pr-2 whitespace-nowrap">
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    {me && <span className="block truncate text-xs text-sidebar-foreground/70">{me.role.name}</span>}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>{`${name} · account`}</TooltipContent>
            </Tooltip>
            <MenuPrimitive.Portal>
              <MenuPrimitive.Positioner side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} sideOffset={8} className="isolate z-50">
                <MenuPrimitive.Popup className="w-(--anchor-width) min-w-56 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                  {me && (
                    <div className="px-2 py-1.5 leading-tight">
                      <div className="truncate text-sm font-medium">{me.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{me.role.name}</div>
                    </div>
                  )}
                  {me && <MenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />}
                  {collapsed && (
                    <MenuPrimitive.Item onClick={toggleTheme} className={ITEM}>
                      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
                      {theme === "dark" ? "Light mode" : "Dark mode"}
                    </MenuPrimitive.Item>
                  )}
                  <MenuPrimitive.Item onClick={onLogout} className={cn(ITEM, "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive")}>
                    <LogOut aria-hidden />
                    Sign out
                  </MenuPrimitive.Item>
                </MenuPrimitive.Popup>
              </MenuPrimitive.Positioner>
            </MenuPrimitive.Portal>
          </MenuPrimitive.Root>
          <button type="button" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="mr-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring in-data-[sidebar=collapsed]:lg:hidden">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders the page only once the account's grants are known; a page outside them shows the no-access state. The API enforces the same grants. */
function RouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: me, isPending, isFetching } = useQuery(meQuery);
  useEffect(() => { void qc.invalidateQueries({ queryKey: keys.me }); }, [qc, pathname]);
  const route = routeFor(pathname);
  if (!route) return children;
  if (isPending) return null;
  if (me?.routes.includes(route)) return children;
  // Wait for the fresh grants before showing no-access, so a newly granted page never flashes it.
  return isFetching ? null : <NoAccess />;
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
        <main className="flex-1 px-4 pt-4 pb-10 lg:px-10 lg:pt-8 [contain:inline-size]"><RouteGate>{children}</RouteGate></main>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Sign out?" confirmLabel="Sign out" pendingLabel="Signing out…" pending={signingOut}
        description="You will need your email and password to sign back in." onConfirm={logout} />
    </div>
  );
}
