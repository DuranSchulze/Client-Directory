import { AppError } from "@/lib/errors";
import { IMPORT_LIMITS } from "./contract";

export async function readUpload(request: Request): Promise<{ data: Buffer; check: boolean }> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > IMPORT_LIMITS.bytes) throw new AppError(413, "Upload exceeds 10 MB");
  if (!request.body) throw new AppError(400, "Expected a multipart workbook upload");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > IMPORT_LIMITS.bytes) { await reader.cancel(); throw new AppError(413, "Upload exceeds 10 MB"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(parts) }).formData(); }
  catch { throw new AppError(400, "Expected a multipart workbook upload"); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(400, "Choose an .xlsx file", "file");
  if (form.getAll("file").length !== 1) throw new AppError(400, "Choose one .xlsx file", "file");
  return { data: Buffer.from(await file.arrayBuffer()), check: form.get("check") === "1" || new URL(request.url).searchParams.get("check") === "1" };
}
