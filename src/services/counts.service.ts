import { directoryCounts, lastMasterUpload } from "@/repositories/counts.repository";
import { listUnlinkedCandidates } from "@/repositories/candidates.repository";
import type { Counts } from "@/lib/api-types";

export async function getCounts(): Promise<Counts> {
  const [counts, candidates, upload] = await Promise.all([directoryCounts(), listUnlinkedCandidates(), lastMasterUpload()]);
  return { ...counts, needsCompany: candidates.length, lastMasterUpload: upload };
}
