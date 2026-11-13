// One allow-list per enum: the same array feeds the DB type, the service checks and the UI options.
export const ENTITIES = ["FILEPINO", "DDS", "AKASYA", "MCADS UB", "THS"] as const;
export const ENGAGEMENTS = ["active", "inactive"] as const;
export const COMPANY_TYPES = ["Non-individual", "Individual"] as const;
export const EFPS = ["eBIR", "eFPS", "VDS"] as const;
export const BILLING_ROLES = ["main", "cc", "none"] as const;
export const MATCHED_BY = ["email", "name", "manual"] as const;
export const STAGES = ["inquiry", "quoted", "invoiced", "paid"] as const;

export type Entity = (typeof ENTITIES)[number];
export type Engagement = (typeof ENGAGEMENTS)[number];
export type CompanyType = (typeof COMPANY_TYPES)[number];
export type BillingRole = (typeof BILLING_ROLES)[number];
export type MatchedBy = (typeof MATCHED_BY)[number];
export type Stage = (typeof STAGES)[number];
