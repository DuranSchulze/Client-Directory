"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, request } from "@/lib/api/http";
import type { AuthResponse } from "@/lib/api-types";
import type { RouteKey } from "@/lib/routes";
import { homeFor, routeFor } from "@/lib/access";

/** Only same-origin paths the account's role can open are followed after sign-in; anything else goes to its home. */
function safeNext(v: string | null, routes: RouteKey[]) {
  const home = homeFor(routes);
  if (!v || !v.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(v)) return home;
  try {
    const url = new URL(v, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/login")) return home;
    const need = routeFor(url.pathname);
    return need && !routes.includes(need) ? home : url.href;
  } catch { return home; }
}

export function LoginForm() {
  const requested = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const { item } = await request<AuthResponse>("/api/auth/login", { json: { email, password } });
      try { new BroadcastChannel("directory-session").postMessage("in"); } catch { /* unsupported */ }
      window.location.href = safeNext(requested, item.routes);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Wait 15 minutes, then try again."
        : err instanceof ApiError && err.status === 401 ? "Email or password is wrong."
        : err instanceof Error ? err.message : "Could not sign in.");
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Use your Client Directory account.</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-muted-foreground">Email</label>
          <input id="email" type="email" autoComplete="username" autoFocus required value={email} className="field-input h-10"
            onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-muted-foreground">Password</label>
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
              className="field-input h-10 pr-11" onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error || undefined} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
              className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-lift hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />{error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full font-semibold" disabled={pending || !email || !password}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
    </div>
  );
}
