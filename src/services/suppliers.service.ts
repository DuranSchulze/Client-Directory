import { withTransaction } from "@/db";
import { AppError } from "@/lib/errors";
import type { SuppliersPage } from "@/lib/api-types";
import { supplierDto } from "@/lib/dto";
import * as repo from "@/repositories/suppliers.repository";
import { pagingParams, validateSort, validateSupplier } from "./validation.service";

export async function getSuppliers() { return (await repo.listSuppliers()).map(supplierDto); }
export async function getSuppliersPage(params: URLSearchParams): Promise<SuppliersPage> {
  const page = pagingParams(params);
  const { direction } = validateSort(params.get("sort"), repo.SUPPLIER_SORT_COLUMNS, "name");
  return withTransaction(async (tx) => {
    await tx.setTransaction({ isolationLevel: "repeatable read", accessMode: "read only" });
    const { rows, ...counts } = await repo.listSuppliersPage(page, direction, tx);
    return { ...counts, items: rows.map(supplierDto) };
  });
}
export async function getSupplier(id: number) {
  const row = await repo.findSupplier(id);
  if (!row) throw new AppError(404, "Supplier not found");
  return supplierDto(row);
}
export async function saveSupplier(body: unknown, id?: number) {
  const input = validateSupplier(body);
  const row = id === undefined ? await repo.insertSupplier(input) : await repo.updateSupplier(id, input);
  if (!row) throw new AppError(404, "Supplier not found");
  return supplierDto(row);
}
