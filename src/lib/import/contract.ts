export const IMPORT_LIMITS = { bytes: 10 * 1024 * 1024, expandedBytes: 100 * 1024 * 1024, entries: 2000, rows: 20000, columns: 200, chunk: 500 } as const;
export type ImportIssue = { sheet: string; row: number; field?: string; reason: string };
export type ImportBuckets = Record<"mergedSpellings" | "sharedEmails" | "invalidEmails" | "rowsWithoutEmail" | "checkContacts" | "unmatchedHeaders" | "invalidValues" | "internalEmails", ImportIssue[]>;
export type ImportPreview = {
  rows: { companies: number; contacts: number; suppliers: number; deptEmails: number; probity: number };
  companies: number;
  changes: Record<"companies" | "contacts" | "suppliers" | "deptEmails" | "probity", { inserted: number; updated: number }>;
  buckets: ImportBuckets;
  probity: { matched: number; notFound: number };
};
export type ImportResult = { changes: ImportPreview["changes"]; probity: ImportPreview["probity"]; buckets: ImportBuckets };
export type ImportPreviewResponse = { preview: ImportPreview };
export type ImportCommitResponse = { result: ImportResult };
export function emptyBuckets(): ImportBuckets {
  return { mergedSpellings: [], sharedEmails: [], invalidEmails: [], rowsWithoutEmail: [], checkContacts: [], unmatchedHeaders: [], invalidValues: [], internalEmails: [] };
}
