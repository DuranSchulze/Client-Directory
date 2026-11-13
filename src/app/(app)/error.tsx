"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center">
      <CircleAlert aria-hidden className="size-8 text-destructive" />
      <h1 className="text-lg font-semibold">This page failed to load</h1>
      <p className="text-sm text-muted-foreground">The server did not answer as expected. Your data is unchanged.</p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="ghost" nativeButton={false} render={<a href="/clients" />}>Back to clients</Button>
      </div>
    </div>
  );
}
