import { directoryCounts } from "@/repositories/counts.repository";
import { listUnlinkedCandidates } from "@/repositories/candidates.repository";
import type { Counts } from "@/lib/api-types";

export async function getCounts(): Promise<Counts> {
  const [counts, candidates] = await Promise.all([directoryCounts(), listUnlinkedCandidates()]);
  return { ...counts, needsCompany: candidates.length };
}
