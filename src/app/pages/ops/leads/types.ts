/**
 * Types for the /ops Leads board. Mirrors the Supabase `leads` table
 * (supabase/migrations/0001_leads.sql). The board reads rows via GET /api/leads.
 */

export type LeadStatus =
  | 'sourced'
  | 'generating'
  | 'scored'
  | 'sent'
  | 'won'
  | 'lost';

export interface Lead {
  id: string;
  created_at: string;
  // sourcing (Places puller)
  place_id: string | null;
  name: string | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  review_count: number | null;
  has_website: boolean | null;
  qualified: boolean | null;
  qualify_reason: string | null;
  // generation (AI agent)
  status: LeadStatus;
  config: unknown;
  eval_score: number | null;
  eval_pass: boolean | null;
  eval_notes: string | null;
  loop_iterations: number | null;
  // outreach
  preview_url: string | null;
  sent_at: string | null;
}

export interface LeadsResponse {
  leads: Lead[];
}
