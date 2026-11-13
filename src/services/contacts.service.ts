import { withTransaction, type Tx } from "@/db";
import { AppError } from "@/lib/errors";
import { contactDto } from "@/lib/dto";
import type { ContactInput } from "@/lib/api-types";
import { findCompany } from "@/repositories/companies.repository";
import * as repo from "@/repositories/contacts.repository";
import { findDeptEmail, findEmailOwner, lockEmailOwnership } from "@/repositories/ownership.repository";
import { refreshProbityMatches } from "./probity.service";
import { validateContact } from "./validation.service";

export async function assertEmailsAvailable(emails: string[], companyId: number | undefined, ex: Tx): Promise<void> {
  const owner = await findEmailOwner(emails, companyId, ex);
  if (owner) throw new AppError(409, `This email already belongs to ${owner.name}`, "emails");
  if (await findDeptEmail(emails, ex)) throw new AppError(409, "Department emails cannot be client contacts", "emails");
}
export async function addContactInTransaction(companyId: number, input: ContactInput, ex: Tx) {
  if (!await findCompany(companyId, ex)) throw new AppError(404, "Client not found");
  await assertEmailsAvailable(input.emails, companyId, ex);
  const contacts = await repo.listContacts(companyId, ex);
  const billingRole = contacts.length ? input.billingRole ?? "none" : "main";
  if (billingRole === "main") await repo.demoteMain(companyId, ex);
  return repo.insertContact({ ...input, companyId, billingRole }, ex);
}
export async function getContacts(companyId: number) {
  if (!await findCompany(companyId)) throw new AppError(404, "Client not found");
  return (await repo.listContacts(companyId)).map(contactDto);
}
export async function saveContact(companyId: number, body: unknown, contactId?: number) {
  const input = validateContact(body, contactId !== undefined);
  return withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    let saved;
    if (contactId === undefined) saved = await addContactInTransaction(companyId, input as ContactInput, tx);
    else {
      const old = await repo.findContact(companyId, contactId, tx);
      if (!old) throw new AppError(404, "Contact not found");
      await assertEmailsAvailable(input.emails ?? old.emails, companyId, tx);
      if (old.billingRole === "main" && input.billingRole !== undefined && input.billingRole !== "main" && (await repo.listContacts(companyId, tx)).length > 1) {
        throw new AppError(409, "Make another contact main first", "billingRole");
      }
      if (input.billingRole === "main") await repo.demoteMain(companyId, tx);
      saved = (await repo.updateContact(contactId, input, tx))!;
    }
    await refreshProbityMatches(tx);
    return contactDto(saved);
  });
}
export async function removeContact(companyId: number, contactId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await lockEmailOwnership(tx);
    const contact = await repo.findContact(companyId, contactId, tx);
    if (!contact) throw new AppError(404, "Contact not found");
    if ((await repo.listContacts(companyId, tx)).length === 1) throw new AppError(409, "Cannot delete the last contact of a client");
    if (contact.billingRole === "main") throw new AppError(409, "Make another contact main first");
    await repo.deleteContact(contactId, tx);
    await refreshProbityMatches(tx);
  });
}
