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

export type SiteStatus =
  | 'none'
  | 'building'
  | 'built'
  | 'publishing'
  | 'published'
  | 'build_failed'
  | 'publish_failed';

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
  // richer sourcing fields (Places details → Duda business data)
  street_address: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  email: string | null;
  hours: unknown;
  photos: string[] | null;
  logo_url: string | null;
  social: Record<string, string> | null;
  google_maps_url: string | null;
  price_level: number | null;
  business_status: string | null;
  description: string | null;
  types: string[] | null;
  service_area: string | null;
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
  // Duda site tracking (build → preview → publish)
  duda_site_name: string | null;
  editor_url: string | null;
  live_url: string | null;
  site_status: SiteStatus | null;
  published_at: string | null;
}

export interface LeadsResponse {
  leads: Lead[];
}
