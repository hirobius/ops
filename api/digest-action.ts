/**
 * Vercel Serverless Function — POST /api/digest-action
 *
 * Mutates one digest item's status on the /ops/digest board. `dismiss` and
 * `restore` fold into this one function (ops#78 scope note) so the digest
 * feature only costs 2 Vercel function slots total (this + GET /api/digest),
 * keeping the deployment at 12/12 on the Hobby plan cap.
 *
 * Request:  { key: string, action: 'dismiss' | 'restore' }
 *   'dismiss' — sets status='dismissed', moving the item out of the main flow
 *               into the collapsible stash.
 *   'restore' — sets status='new', bringing it back.
 *
 * In dev, the same contract is served by scripts/digest-middleware.mjs.
 * Success: { ok: true, ...extra } · Error: { error } 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler
 * (ADR-0004); the row-mutation logic lives in lib/digests/actions.mjs.
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { applyDigestAction } from '../lib/digests/actions.mjs';

export async function digestActionHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { key?: unknown; action?: unknown } | undefined;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  if (!key || !action) return { status: 400, body: { error: 'key and action are required' } };

  return applyDigestAction(sb, { key, action });
}

export default withOpsHandler('POST', withServiceClient(digestActionHandler));
