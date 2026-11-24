import type { ScrapeStatus } from "@/lib/api-types";
import { readScrapeStatus } from "@/repositories/scrape.repository";

export async function getScrapeStatus(): Promise<ScrapeStatus> {
  try {
    const { running, lastStartedAt, lastFinishedAt, intervalMinutes } = await readScrapeStatus();
    const completed = running?.completed;
    return {
      running: running ? {
        startedAt: new Date(running.startedAt).toISOString(),
        completed: typeof completed === "number" && Number.isSafeInteger(completed) && completed >= 0 ? completed : 0,
      } : null,
      nextAt: lastStartedAt !== null && intervalMinutes !== null
        ? new Date(Date.parse(lastStartedAt) + intervalMinutes * 60_000).toISOString()
        : null,
      lastFinishedAt: lastFinishedAt === null ? null : new Date(lastFinishedAt).toISOString(),
    };
  } catch (error) {
    const seen = new Set<unknown>();
    let cause: unknown = error;
    while (cause && typeof cause === "object" && !seen.has(cause)) {
      if ("code" in cause && cause.code === "42P01") return { running: null, nextAt: null, lastFinishedAt: null };
      seen.add(cause);
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}
