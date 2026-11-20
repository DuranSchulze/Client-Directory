import { CalendarClock, TriangleAlert } from "lucide-react";
import type { LastMasterUpload } from "@/lib/api-types";
import { ago, day } from "@/lib/format";

/** One line saying when the master Excel was last uploaded; nothing while loading. */
export function MasterUploadNote({ upload }: { upload: LastMasterUpload | null | undefined }) {
  if (upload === undefined) return null;
  if (upload === null) {
    return (
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] px-3 py-1 text-xs font-semibold text-warning">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />No master list uploaded yet
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit max-w-full items-start gap-2 rounded-lg bg-accent px-3 py-1 text-xs text-muted-foreground">
      <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        Master list uploaded <time dateTime={upload.at} title={new Date(upload.at).toLocaleString()} className="font-semibold text-foreground">{ago(upload.at)}</time> ({day(upload.at)}) by {upload.by} · {upload.fileName}
      </span>
    </span>
  );
}
