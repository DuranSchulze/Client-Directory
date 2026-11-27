"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, Eye, EyeOff, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/app/login/login-form";
import { errorMessage, request } from "@/lib/api/http";
import { meQuery } from "@/lib/api/queries";
import type { AuthResponse, PasswordChangeInput } from "@/lib/api-types";
import { PASSWORD_RULES } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

const TOGGLE = "absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-lift hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function ChangePasswordForm() {
  const { data: me, error: meError, refetch, isFetching } = useQuery(meQuery);
  const requested = useSearchParams().get("next");
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
        {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  // Forced: the session itself proves the temporary password, so it isn't asked again.
  const forced = me.mustChangePassword;
  const checks = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: !!next && r.test(next) }));
  const strong = checks.every((c) => c.ok);
  const matches = !!confirm && next === confirm;
  const ready = (forced || !!current) && strong && matches;
  const type = show ? "text" : "password";
  const toggle = (
    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show} className={TOGGLE}>
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError("");
    try {
      const body: PasswordChangeInput = forced ? { newPassword: next } : { currentPassword: current, newPassword: next };
      const { item } = await request<AuthResponse>("/api/auth/password", { json: body });
      // No broadcast here: this page's own listener would reload it before the navigation. Other tabs share the new cookie.
      // Full load: the API set a fresh session cookie; start with it and an empty cache.
      window.location.assign(safeNext(requested, item.routes));
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
        {forced ? `Welcome, ${me.name}. Choose the password you'll use from now on.` : "Your other devices will be signed out."}
      </p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
        {!forced && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current" className="text-xs font-semibold text-muted-foreground">Current password</label>
            <div className="relative">
              <input id="current" type={type} autoComplete="current-password" autoFocus required value={current} className="field-input h-10 pr-11"
                onChange={(e) => setCurrent(e.target.value)} />
              {toggle}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new" className="text-xs font-semibold text-muted-foreground">New password</label>
          <div className="relative">
            <input id="new" type={type} autoComplete="new-password" autoFocus={forced} required value={next} className="field-input h-10 pr-11"
              aria-describedby="new-rules" aria-invalid={!!next && !strong} onChange={(e) => setNext(e.target.value)} />
            {forced && toggle}
          </div>
          <p id="new-rules-title" className="mt-1 text-xs font-semibold text-muted-foreground">Your password needs</p>
          <ul id="new-rules" aria-labelledby="new-rules-title" className="flex flex-col gap-1 text-sm">
            {checks.map((c) => (
              <li key={c.id} className={cn("flex items-start gap-1.5", c.ok ? "text-success" : "text-muted-foreground")}>
                {c.ok ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : <X aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                <span>{c.label}<span className="sr-only">{c.ok ? ": done" : ": missing"}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-xs font-semibold text-muted-foreground">Type it again</label>
          <input id="confirm" type={type} autoComplete="new-password" required value={confirm} className="field-input h-10"
            aria-invalid={!!confirm && !matches} aria-describedby={confirm && !matches ? "confirm-error" : undefined}
            onChange={(e) => setConfirm(e.target.value)} />
          {confirm && !matches && <p id="confirm-error" className="text-sm text-destructive">The two passwords don&apos;t match.</p>}
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />{error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full font-semibold" disabled={pending || !ready}>
          {pending ? "Saving…" : forced ? "Save password and continue" : "Change password"}
        </Button>
        {forced
          ? <Button type="button" variant="ghost" onClick={signOut} disabled={pending}>Sign out</Button>
          // Once sent, the change commits even if the user leaves, so Cancel waits for the answer.
          : pending
            ? <Button type="button" variant="ghost" disabled>Cancel</Button>
            : <Link href={safeNext(requested, me.routes)} className={buttonVariants({ variant: "ghost" })}>Cancel</Link>}
      </form>
    </div>
  );
}
