/**
 * lib/digests/actions — shared digest-item action logic for /api/digest-action
 * (prod) and scripts/digest-middleware.mjs (dev). One implementation, no drift.
 *
 * P1 (ops#78) ships two actions only: `dismiss` (leaves the main flow into the
 * stash) and `restore` (brings it back to 'new'). `analyze`/`promote` are P2-P4
 * (LLM-backed) and land here later without a new endpoint — the `status` enum
 * (migration 0011) already has room for them.
 */

import { updateDigestItem } from '../supabase/digests.mjs';

const SIMPLE = {
  dismiss: () => ({ status: 'dismissed' }),
  restore: () => ({ status: 'new' }),
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ key: string, action: string }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function applyDigestAction(sb, { key, action }) {
  if (Object.prototype.hasOwnProperty.call(SIMPLE, action)) {
    const patch = SIMPLE[action]();
    const { error } = await updateDigestItem(sb, key, patch);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true, ...patch } };
  }

  return { status: 400, body: { error: `unknown action: ${action}` } };
}
