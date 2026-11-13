"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { meQuery } from "@/lib/api/queries";
import { homeFor, NO_ACCESS } from "@/lib/access";

/** Shown in place of a page the account's role does not grant. */
export function NoAccess() {
  const { data: me } = useQuery(meQuery);
  const home = me ? homeFor(me.routes) : NO_ACCESS;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-muted-foreground"><Lock aria-hidden className="size-5" /></span>
      <h1 className="text-xl font-bold tracking-tight">You can&apos;t open this page</h1>
      <p className="text-sm text-muted-foreground">
        {me && home === NO_ACCESS
          ? `Your role, ${me.role.name}, grants no pages in the Client Directory. Ask an account manager to change it.`
          : `Your role${me ? `, ${me.role.name},` : ""} does not include this page. Ask an account manager if you need it.`}
      </p>
      {home !== NO_ACCESS && <Link href={home} className="link-draw mt-1 text-sm font-semibold">Go to your start page</Link>}
    </div>
  );
}
