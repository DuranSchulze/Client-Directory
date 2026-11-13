"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { DataTableCard, type Column } from "@/components/shared/data-table-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { Pill } from "@/components/shared/pills";
import { errorMessage, request } from "@/lib/api/http";
import { keys, rolesQuery, usersQuery } from "@/lib/api/queries";
import { useMutate } from "@/lib/api/use-mutate";
import type { Account, AccountInput, AccountResponse, Role, RoleInput, RoleResponse } from "@/lib/api-types";
import { ROUTES, type RouteKey } from "@/lib/routes";
import { stamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROUTE_LABEL: Record<RouteKey, string> = { directory: "Directory", import: "Import", accounts: "Accounts" };
const ROUTE_HINT: Record<RouteKey, string> = {
  directory: "Clients, Probity, Needs company, OPS suppliers and Dept. emails.",
  import: "Upload the clients workbook.",
  accounts: "Manage accounts and roles.",
};
// Keeps the API's canonical order whatever order the boxes are ticked in.
const toggled = (routes: RouteKey[], r: RouteKey, on: boolean) => ROUTES.filter((k) => (k === r ? on : routes.includes(k)));
const pages = (routes: RouteKey[]) => routes.map((r) => ROUTE_LABEL[r]).join(", ");
const ACCOUNT_KEYS = [keys.users, keys.roles, keys.me];

export function AccountsView() {
  const { data: users, error, isPending, isFetching, refetch } = useQuery(usersQuery);
  const { data: roles } = useQuery(rolesQuery);
  const [open, setOpen] = useState(false);

  const columns: Column<Account>[] = [
    { key: "name", header: "Name", sortValue: (u) => u.name, className: "font-semibold", render: (u) => <>{u.name}<span className="block text-xs font-normal break-all text-muted-foreground md:hidden">{u.email}</span></> },
    { key: "email", header: "Email", desktopOnly: true, sortValue: (u) => u.email, className: "break-all", render: (u) => u.email },
    { key: "role", header: "Role", sortValue: (u) => u.role.name, className: "w-40 md:w-56", render: (u) => <RoleSelect account={u} roles={roles} /> },
    { key: "created", header: "Created", desktopOnly: true, sortValue: (u) => u.createdAt, className: "whitespace-nowrap text-muted-foreground tabular-nums", render: (u) => stamp(u.createdAt) },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <PageHeader title="Accounts" description="People who can sign in, and the role that decides which pages each one may use."
        actions={<Button onClick={() => setOpen(true)} disabled={!roles}><Plus />New account</Button>} />
      <DataTableCard title="Accounts" rows={users ?? []} columns={columns} getRowId={(u) => u.id} itemLabel="accounts"
        loading={isPending} refetching={isFetching && !isPending} error={error ? errorMessage(error) : null} onRetry={() => refetch()}
        empty={<EmptyState icon={UsersRound} title="No accounts yet." actionLabel="New account" onAction={() => setOpen(true)} />} />
      <RolesSection roles={roles} />
      {/* Remounted per open so the draft always starts empty. */}
      {open && roles && <NewAccountDialog roles={roles} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Saves on change; a refused change (lockout guards) snaps back with the API's reason. */
function RoleSelect({ account, roles }: { account: Account; roles: Role[] | undefined }) {
  const save = useMutate<number, Account>({
    fn: (roleId) => request<AccountResponse>(`/api/users/${account.id}`, { method: "PATCH", json: { roleId } }).then((r) => r.item),
    invalidate: ACCOUNT_KEYS,
    success: (u) => `${u.name} is now ${u.role.name}`,
    onFail: (e) => { toast.error(`Could not change ${account.name}'s role: ${errorMessage(e)}`); return true; },
  });
  // Locked while saving, so a second pick can't race the first and leave the earlier role saved.
  const value = String(save.isPending ? save.variables : account.role.id);
  if (!roles?.length) return <span>{account.role.name}</span>;
  return (
    <select aria-label={`Role for ${account.name}`} value={value} disabled={save.isPending} className="field-select h-9 w-full max-w-52 bg-sunk dark:bg-field"
      onChange={(e) => { const id = Number(e.target.value); if (id && id !== account.role.id) save.mutate(id); }}>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}

function RolesSection({ roles }: { roles: Role[] | undefined }) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);
  const remove = useMutate<Role, unknown>({
    fn: (r) => request(`/api/roles/${r.id}`, { method: "DELETE" }),
    invalidate: [keys.roles],
    success: () => `Role ${removing?.name ?? ""} deleted`,
    onDone: () => setRemoving(null),
    onFail: (e) => { toast.error(`Could not delete the role: ${errorMessage(e)}`); setRemoving(null); return true; },
  });

  return (
    <section aria-labelledby="roles-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="roles-heading" className="text-base font-bold tracking-tight">Roles</h2>
          <p className="text-sm text-muted-foreground">Each role grants a set of pages. Owner always has every page and cannot change.</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing("new")}><Plus />New role</Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy={!roles || undefined}>
        {!roles && Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl bg-card p-4">
            {i === 0 && <span className="sr-only">Loading roles</span>}
            <Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" />
          </li>
        ))}
        {roles?.map((r) => (
          <li key={r.id} className="lift-hover flex flex-col gap-3 rounded-xl bg-card p-4 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{r.name}</span>
                  {r.locked && <Lock aria-label="Locked role" className="size-3.5 shrink-0 text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground tabular-nums">{r.users === 1 ? "1 account" : `${r.users.toLocaleString()} accounts`}</p>
              </div>
              {!r.locked && (
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit role ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete role ${r.name}`}
                    disabled={r.users > 0} title={r.users > 0 ? "Move its accounts to another role first" : undefined} onClick={() => setRemoving(r)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.routes.map((k) => <Pill key={k} tone={k === "accounts" ? "gold" : "neutral"}>{ROUTE_LABEL[k]}</Pill>)}
            </div>
          </li>
        ))}
      </ul>
      {editing && <RoleDialog role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} pending={remove.isPending} pendingLabel="Deleting…" destructive
        title={`Delete the ${removing?.name ?? ""} role?`} description="No account uses it. This cannot be undone."
        confirmLabel="Delete role" onConfirm={() => removing && remove.mutate(removing)} />
    </section>
  );
}

function RoleDialog({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [routes, setRoutes] = useState<RouteKey[]>(role?.routes ?? []);
  const [error, setError] = useState("");
  const save = useMutate<RoleInput, Role>({
    fn: (body) => (role
      ? request<RoleResponse>(`/api/roles/${role.id}`, { method: "PATCH", json: body })
      : request<RoleResponse>("/api/roles", { json: body })).then((r) => r.item),
    invalidate: ACCOUNT_KEYS,
    success: (r) => (role ? `Role ${r.name} saved: ${pages(r.routes)}` : `Role ${r.name} created`),
    onDone: onClose,
    onFail: (e) => { setError(errorMessage(e)); return true; },
  });
  const valid = name.trim() && routes.length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setError(""); if (valid) save.mutate({ name: name.trim(), routes }); }} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
            <DialogDescription>Accounts with this role can open the pages you tick. Changes apply on their next click.</DialogDescription>
          </DialogHeader>
          <Field id="role-name" label="Name" required>
            <input id="role-name" autoComplete="off" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Accounting" className="field-input" autoFocus />
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Pages</legend>
            {ROUTES.map((r) => (
              <label key={r} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-lift">
                <Checkbox className="mt-0.5" checked={routes.includes(r)} onCheckedChange={(on) => setRoutes((cur) => toggled(cur, r, on))} />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{ROUTE_LABEL[r]}</span>
                  <span className="text-xs text-muted-foreground">{ROUTE_HINT[r]}</span>
                </span>
              </label>
            ))}
            {!routes.length && <p className="px-2 text-xs text-destructive">Pick at least one page.</p>}
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : role ? "Save role" : "Create role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewAccountDialog({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Default to the first unlocked role, so a new account is never an Owner by accident.
  const [roleId, setRoleId] = useState(String((roles.find((r) => !r.locked) ?? roles[0])?.id ?? ""));
  const [error, setError] = useState("");
  const role = roles.find((r) => String(r.id) === roleId);
  const create = useMutate<AccountInput, Account>({
    fn: (body) => request<AccountResponse>("/api/users", { json: body }).then((r) => r.item),
    invalidate: ACCOUNT_KEYS,
    success: (u) => `Account created for ${u.email}`,
    onDone: onClose,
    onFail: (e) => { setError(errorMessage(e)); return true; },
  });
  const valid = name.trim() && email.trim() && password && roleId;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !create.isPending) onClose(); }}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setError(""); if (valid) create.mutate({ name: name.trim(), email: email.trim(), password, roleId: Number(roleId) }); }}
          className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>The person signs in with this email and password. Share the password securely.</DialogDescription>
          </DialogHeader>
          <Field id="acc-name" label="Name" required>
            <input id="acc-name" autoComplete="off" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="field-input" autoFocus />
          </Field>
          <Field id="acc-email" label="Email" required>
            <input id="acc-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" />
          </Field>
          <Field id="acc-password" label="Password" required hint="At most 72 bytes.">
            <input id="acc-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" />
          </Field>
          <Field id="acc-role" label="Role" required hint={role ? `Can use: ${pages(role.routes)}${role.locked ? ". Owners can change every account and role." : ""}` : undefined}>
            <select id="acc-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={cn("field-select h-9 w-full bg-sunk dark:bg-field")}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
            <Button type="submit" disabled={!valid || create.isPending}>{create.isPending ? "Creating…" : "Create account"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
