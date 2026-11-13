import { AppError } from "@/lib/errors";
import { supplierDto } from "@/lib/dto";
import * as repo from "@/repositories/suppliers.repository";
import { validateSupplier } from "./validation.service";

export async function getSuppliers() { return (await repo.listSuppliers()).map(supplierDto); }
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
