/**
 * Types for the /ops/digest board. Mirrors the `digest_items` table
 * (supabase/migrations/0011_digest_items.sql). Read via GET /api/digest;
 * mutated via POST /api/digest-action.
 */

export type DigestItemStatus = 'new' | 'analyzed' | 'promoted' | 'dismissed';

export interface DigestLink {
  label: string;
  url: string;
}

export interface DigestItem {
  id: string;
  item_key: string;
  date: string;
  source: string | null;
  title: string;
  summary: string | null;
  ops_angle: string | null;
  tag: string | null;
  links: DigestLink[];
  status: DigestItemStatus;
  analysis: unknown;
  issue_url: string | null;
  created_at: string;
  updated_at: string;
}

export type DigestAction = 'dismiss' | 'restore';

export interface DigestResponse {
  items: DigestItem[];
}
