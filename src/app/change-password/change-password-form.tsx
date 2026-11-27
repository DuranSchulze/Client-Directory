"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, Eye, EyeOff, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, request } from "@/lib/api/http";
import { meQuery } from "@/lib/api/queries";
import { homeFor } from "@/lib/access";
import type { AuthResponse, PasswordChangeInput } from "@/lib/api-types";
import { PASSWORD_RULES } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

// "Not blank" is implied by the length rule, so the checklist skips it.
const RULES = PASSWORD_RULES.filter((r) => r.id !== "blank");

export function ChangePasswordForm() {
  const { data: me, error: meError, refetch, isFetching } = useQuery(meQuery);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Another tab signed in or out: reload, which drops the typed passwords instead of leaving them for the next account.
  useEffect(() => {
    let ch: BroadcastChannel;
    try { ch = new BroadcastChannel("directory-session"); } catch { return; }
    ch.onmessage = () => window.location.reload();
    return () => ch.close();
  }, []);

  // A 401 already sent the browser to /login; anything else (API down) needs a way out of the skeleton.
  if (!me && meError) {
    return (
      <div role="alert" className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-xl font-bold tracking-tight">Couldn&apos;t load your account</h1>
        <p className="text-sm text-muted-foreground">{errorMessage(meError)}</p>
        <Button className="self-start" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Retrying…" : "Try again"}</Button>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">Loading…</span>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const forced = me.mustChangePassword;
  const checks = RULES.map((r) => ({ id: r.id, label: r.label.replace(/^Password (\w)/, (_, c: string) => c.toUpperCase()), ok: !!next && r.test(next, me.email) }));
  const strong = checks.every((c) => c.ok);
  const matches = !!confirm && next === confirm;
  const type = show ? "text" : "password";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !strong || !matches) return;
    setPending(true);
    setError("");
    try {
      const { item } = await request<AuthResponse>("/api/auth/password", { json: { currentPassword: current, newPassword: next } satisfies PasswordChangeInput });
      // No broadcast here: this page's own listener would reload it before the navigation. Other tabs share the new cookie.
      // Full load: the API set a fresh session cookie; start with it and an empty cache.
      window.location.href = homeFor(item.routes);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    try { await request("/api/auth/logout", { method: "POST" }); } catch (err) { setError(errorMessage(err)); setPending(false); return; }
    try { new BroadcastChannel("directory-session").postMessage("out"); } catch { /* unsupported */ }
    window.location.href = "/login";
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">{forced ? "Set your password" : "Change password"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {forced ? `${me.name}, you signed in with a temporary password. Choose your own to continue.` : "Your other devices will be signed out."}
      </p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="current" className="text-xs font-semibold text-muted-foreground">{forced ? "Temporary password" : "Current password"}</label>
          <div className="relative">
            <input id="current" type={type} autoComplete="current-password" autoFocus required value={current} className="field-input h-10 pr-11"
              onChange={(e) => setCurrent(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show}
              className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-lift hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new" className="text-xs font-semibold text-muted-foreground">New password</label>
          <input id="new" type={type} autoComplete="new-password" required value={next} className="field-input h-10"
            aria-describedby="new-rules" aria-invalid={!!next && !strong} onChange={(e) => setNext(e.target.value)} />
          <ul id="new-rules" aria-label="Password requirements" className="mt-1 flex flex-col gap-1 text-sm">
            {checks.map((c) => (
              <li key={c.id} className={cn("flex items-start gap-1.5", c.ok ? "text-success" : "text-muted-foreground")}>
                {c.ok ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : <X aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                <span>{c.label}<span className="sr-only">{c.ok ? ": met" : ": not met"}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-xs font-semibold text-muted-foreground">Confirm new password</label>
          <input id="confirm" type={type} autoComplete="new-password" required value={confirm} className="field-input h-10"
            aria-invalid={!!confirm && !matches} aria-describedby={confirm && !matches ? "confirm-error" : undefined}
            onChange={(e) => setConfirm(e.target.value)} />
          {confirm && !matches && <p id="confirm-error" className="text-sm text-destructive">Passwords don&apos;t match.</p>}
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />{error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full font-semibold" disabled={pending || !current || !strong || !matches}>
          {pending ? "Saving…" : forced ? "Set password and continue" : "Change password"}
        </Button>
        {forced
          ? <Button type="button" variant="ghost" onClick={signOut} disabled={pending}>Sign out</Button>
          // Once sent, the change commits even if the user leaves, so Cancel waits for the answer.
          : pending
            ? <Button type="button" variant="ghost" disabled>Cancel</Button>
            : <Link href={homeFor(me.routes)} className={buttonVariants({ variant: "ghost" })}>Cancel</Link>}
      </form>
    </div>
  );
}
