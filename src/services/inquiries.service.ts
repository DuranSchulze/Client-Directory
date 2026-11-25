import { withTransaction } from "@/db";
import { INQUIRY_SORT_COLUMNS, listInquiriesPage } from "@/repositories/candidates.repository";
import { pagingParams, validateSort } from "./validation.service";

export async function getInquiriesPage(params: URLSearchParams) {
  const page = pagingParams(params);
  const { key, direction } = validateSort(params.get("sort") ?? "last_contact:desc", INQUIRY_SORT_COLUMNS, "last_contact");
  return withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    return listInquiriesPage(page, key, direction, tx);
  });
}
