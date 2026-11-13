import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import { deptEmailDto } from "@/lib/dto";
import * as repo from "@/repositories/dept-emails.repository";
import { findEmailOwner, lockEmailOwnership } from "@/repositories/ownership.repository";
import { validateDeptEmail } from "./validation.service";

export async function getDeptEmails() { return (await repo.listDeptEmails()).map(deptEmailDto); }
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
    const row = id === undefined ? await repo.insertDeptEmail({ ...input, department: input.department! }, tx) : (await repo.updateDeptEmail(id, input, tx))!;
    return deptEmailDto(row);
  });
}
