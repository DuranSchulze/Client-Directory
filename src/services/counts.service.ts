import { directoryCounts, lastMasterUpload } from "@/repositories/counts.repository";
import type { Counts } from "@/lib/api-types";
import { getNeedsQueue } from "./needs-company.service";

// The badge keeps its old cap: the queue list used to stop at the bulk limit of 5,000.
const BADGE_CAP = 5000;

export async function getCounts(): Promise<Counts> {
  const [counts, queue, upload] = await Promise.all([directoryCounts(), getNeedsQueue(), lastMasterUpload()]);
  return { ...counts, needsCompany: Math.min(queue.items.length, BADGE_CAP), lastMasterUpload: upload };
}
