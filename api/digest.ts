/**
 * Vercel Serverless Function — GET /api/digest
 *
 * Read side for the /ops/digest board. Returns digest items from the
 * `digest_items` table (migration 0011) — the store now backing the page,
 * replacing the old import.meta.glob(src/app/digests/*.json) reader.
 * Query: ?limit=<n> (default 500, max 2000) · ?include_dismissed=0 to drop
 * dismissed rows server-side (default includes them — the page filters
 * client-side to render the collapsible stash).
 *
 * Items still enter the system by committing JSON under src/app/digests/ (the
 * "scrub my newsletters" trigger phrase, docs/ai/HANDOFF.md) — run
 * `node scripts/seed-digest-items.mjs --apply` afterward to import/refresh the
 * store (idempotent, keyed on item_key).
 *
 * Auth + Supabase acquisition are owned by lib/api/handler (ADR-0004). In dev,
 * the same contract is served by scripts/digest-middleware.mjs.
 *
 * Success: { items: DigestItem[] } · Error: { error, code? } 401/405/500/503
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { listDigestItems } from '../lib/supabase/digests.mjs';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export async function digestHandler(sb: SupabaseClient, req: VercelRequest): Promise<HandlerResult> {
  const limit = clampLimit(pick(req.query['limit']));
  const includeDismissed = pick(req.query['include_dismissed']) !== '0';

  const { data, error } = await listDigestItems(sb, { limit, includeDismissed });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { items: data ?? [] } };
}

export default withOpsHandler('GET', withServiceClient(digestHandler));

function pick(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;
}
function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}
