import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import { deptEmailDto } from "@/lib/dto";
import type { DeptEmailsPage } from "@/lib/api-types";
import * as repo from "@/repositories/dept-emails.repository";
import { findEmailOwner, lockEmailOwnership } from "@/repositories/ownership.repository";
import { invalid, pagingParams, validateDeptEmail, validateSort } from "./validation.service";

export async function getDeptEmails() { return (await repo.listDeptEmails()).map(deptEmailDto); }
export async function getDeptEmailsPage(params: URLSearchParams): Promise<DeptEmailsPage> {
  const page = pagingParams(params);
  const { direction } = validateSort(params.get("sort"), repo.DEPT_SORT_COLUMNS, "sortOrder");
  const department = params.get("dept") ?? "";
  if (department.includes("\0")) invalid("dept");
  return withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    const { rows, ...counts } = await repo.listDeptEmailsPage(page, department, direction, tx);
    return { ...counts, items: rows.map(deptEmailDto) };
  });
}
export async function getDeptEmail(id: number) {
  const row = await repo.findDeptEmailById(id);
  if (!row) throw new AppError(404, "Department email not found");
  return deptEmailDto(row);
}
export async function saveDeptEmail(body: unknown, id?: number) {
  const input = validateDeptEmail(body, id !== undefined);
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const old = id === undefined ? null : await repo.findDeptEmailById(id, tx);
    if (id !== undefined && !old) throw new AppError(404, "Department email not found");
    const owner = await findEmailOwner(input.emails ?? old?.emails ?? [], undefined, tx);
    if (owner) throw new AppError(409, `This email already belongs to ${owner.name}`, "emails");
    if (old && !Object.keys(input).length) return deptEmailDto(old);
    if (id === undefined) {
      const sortOrder = input.sortOrder ?? await repo.nextDeptEmailSortOrder(tx);
      if (sortOrder > 2147483647) invalid("sortOrder", "No higher sort order is available");
      return deptEmailDto(await repo.insertDeptEmail({ ...input, department: input.department!, sortOrder }, tx));
    }
    const row = (await repo.updateDeptEmail(id, input, tx))!;
    return deptEmailDto(row);
  });
}
