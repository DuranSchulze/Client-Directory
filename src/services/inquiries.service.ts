import { withTransaction } from "@/db";
import type { InquiryTimeline } from "@/lib/api-types";
import { AppError } from "@/lib/errors";
import { findInquiryTimeline, INQUIRY_SORT_COLUMNS, listInquiriesPage } from "@/repositories/candidates.repository";
import { id, pagingParams, validateSort } from "./validation.service";

export async function getInquiriesPage(params: URLSearchParams) {
  const page = pagingParams(params);
  const { key, direction } = validateSort(params.get("sort") ?? "last_contact:desc", INQUIRY_SORT_COLUMNS, "last_contact");
  return withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    return listInquiriesPage(page, key, direction, tx);
  });
}

export async function getInquiryTimeline(candidateId: string): Promise<InquiryTimeline> {
  const row = await findInquiryTimeline(id(candidateId));
  if (!row) throw new AppError(404, "Inquiry not found");
  return { items: row.timeline?.items ?? [], truncated: row.timeline?.truncated ?? false };
}
