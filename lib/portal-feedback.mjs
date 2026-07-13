/**
 * lib/portal-feedback.mjs — client-portal feedback intake (migration 0012).
 *
 * The persistence behind the portal's "Send feedback" card (/c/:slug), which
 * previously ended in a console.log. Rows land in `client_feedback` and are
 * read back on /ops (ClientFeedbackPanel) — the change-request inbox a paying
 * client's "can you update our hours" lands in.
 *
 * Both functions take the service-role client from getServiceClient() and
 * return either a `{ status, body }` handler result (submitFeedback — it owns
 * validation) or the raw Supabase result shape (listFeedback — mirrors
 * lib/supabase/digests.mjs). Wired by api/portal-verify.ts, which owns auth:
 * submits require a valid portal session for the slug, listing requires an
 * ops session.
 */

const MESSAGE_MAX = 5000;
const SLUG_MAX = 100;
const CONTACT_MAX = 300;

/**
 * Validate + insert one feedback row.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ slug?: unknown, message?: unknown, contact?: unknown }} input
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export async function submitFeedback(sb, input) {
  const slug = typeof input?.slug === 'string' ? input.slug.trim() : '';
  const message = typeof input?.message === 'string' ? input.message.trim() : '';
  const contact = typeof input?.contact === 'string' ? input.contact.trim() : '';

  if (!slug || slug.length > SLUG_MAX) {
    return { status: 400, body: { error: 'slug is required' } };
  }
  if (!message) {
    return { status: 400, body: { error: 'message is required' } };
  }
  if (message.length > MESSAGE_MAX) {
    return { status: 400, body: { error: `message is too long (max ${MESSAGE_MAX} chars)` } };
  }
  if (contact.length > CONTACT_MAX) {
    return { status: 400, body: { error: `contact is too long (max ${CONTACT_MAX} chars)` } };
  }

  const { error } = await sb.from('client_feedback').insert({
    slug,
    message,
    contact: contact || null,
  });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

/**
 * Newest-first feedback rows for the /ops inbox.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns Supabase result shape ({ data, error }).
 */
export function listFeedback(sb, { limit = 200 } = {}) {
  return sb
    .from('client_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
}
