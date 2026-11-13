import type { Stage } from "./enums";

export type ClientStatus = "inquiry" | "active" | "past" | "lost";
export type Field<T> = { value: T; source: string; confidence: number };
export type Amount = { amount: number; currency: string; total?: boolean };
export type StageAmount = { stage: "quoted" | "invoiced"; amount: number; currency: string; date: string | null; raw_item_id: number };
export type PaymentBasis = "stated" | "invoice" | "unknown" | "manual";
export type Payment = {
  date: string | null; amount: number | null; currency: string | null; basis: PaymentBasis;
  raw_item_id: number | null; kind?: "confirmed" | "claim" | "screenshot";
};
export type Handler = { department: string; mailbox: string; first: string | null; last: string | null; messages: number };
export type TimelineItem = {
  date: string | null; stage: string; department: string; mailbox: string;
  amounts: Amount[]; raw_item_id: number; snippet: string;
};
export type CandidateFields = Partial<{
  name: Field<string>; emails: Field<string[]>; phones: Field<string[]>; company: Field<string>;
  stage: Field<Stage>; status: Field<ClientStatus>; services: Field<string[]>; department: Field<string>;
  engagement_paid: Field<boolean>; amounts: Field<StageAmount[]>; stage_dates: Field<Partial<Record<Stage, string>>>;
  needs_check: Field<string[]>; first_contact: Field<string>; last_contact: Field<string>; sources: Field<string[]>;
  payments: Field<Payment[]>; client_since: Field<string>; services_availed: Field<string[]>;
  handlers: Field<Handler[]>; timeline: Field<{ items: TimelineItem[]; truncated: boolean }>;
}>;
