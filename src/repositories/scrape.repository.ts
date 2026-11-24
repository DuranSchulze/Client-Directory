import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ext_jobs as jobs, ext_schedule as schedule } from "@/db/external/scrape";

export async function readScrapeStatus() {
  const { rows: [status] } = await db.execute<{
    running: { startedAt: string; completed: unknown } | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    intervalMinutes: number | null;
  }>(sql`
    SELECT (
      SELECT jsonb_build_object('startedAt', ${jobs.startedAt}, 'completed', ${jobs.progress}->'done')
      FROM ${jobs}
      WHERE ${jobs.status} IN ('running', 'paused')
        AND ${jobs.heartbeatAt} BETWEEN statement_timestamp() - interval '2 minutes' AND statement_timestamp()
      ORDER BY ${jobs.startedAt} DESC, ${jobs.id} DESC
      LIMIT 1
    ) AS "running",
    (SELECT to_json(max(${jobs.startedAt})) FROM ${jobs}) AS "lastStartedAt",
    (SELECT to_json(max(${jobs.finishedAt})) FROM ${jobs}) AS "lastFinishedAt",
    (SELECT CASE WHEN ${schedule.enabled} THEN ${schedule.intervalMinutes} END
      FROM ${schedule} ORDER BY ${schedule.id} LIMIT 1) AS "intervalMinutes"
  `);
  return status;
}
