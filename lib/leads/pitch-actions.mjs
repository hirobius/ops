/**
 * lib/leads/pitch-actions.mjs — the write side of the pitch queue.
 *
 * Handler-shaped ({ status, body }) so `api/lead-action.ts` stays a dispatcher
 * and the decisions stay testable against a stub client.
 *
 * Every write re-checks the two compliance gates against the CURRENT row
 * rather than trusting what the page was showing. A queue open in a tab since
 * this morning may be looking at a lead that has opted out since.
 */

import { addLeadNote, getPitchState, updateLead } from '../supabase/leads.mjs';
import { isPitchable, stagePatch } from './pitch.mjs';

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Shared guard: the lead exists, is not suppressed, and has something to pitch. */
async function loadPitchable(sb, leadId) {
  const { data, error } = await getPitchState(sb, leadId);
  if (error || !data) return { error: { status: 404, body: { error: 'lead not found' } } };
  if (!isPitchable(data)) {
    return {
      error: {
        status: 409,
        body: {
          error: data.do_not_contact
            ? 'lead is suppressed (do_not_contact) — it can never be contacted again'
            : 'lead has no preview_url — there is nothing to pitch yet',
          code: 'LEAD_NOT_PITCHABLE',
        },
      },
    };
  }
  return { lead: data };
}

/**
 * Move a lead to a pitch stage.
 *
 * `sent` demands a channel and stamps `contacted_at` — that pair is the
 * evidence the #321 tripwire is evaluated on, so this is the call that moves
 * the business's headline number off zero.
 */
export async function setPitchStage(sb, leadId, { stage, channel } = {}) {
  const guard = await loadPitchable(sb, leadId);
  if (guard.error) return guard.error;

  const patch = stagePatch(
    stage,
    {
      contactedAt: guard.lead.contacted_at,
      repliedAt: guard.lead.replied_at,
      wonAt: guard.lead.won_at,
      lostAt: guard.lead.lost_at,
    },
    { channel },
  );
  if (!patch.ok) return { status: 400, body: { error: patch.error } };

  const { error } = await updateLead(sb, leadId, patch.patch);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true, stage, patched: Object.keys(patch.patch) } };
}

/** Append a note to the engagement log. */
export async function addPitchNote(sb, leadId, { author, body } = {}) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return { status: 400, body: { error: 'note body is required' } };
  const who = typeof author === 'string' && author.trim() ? author.trim() : 'unknown';

  const guard = await loadPitchable(sb, leadId);
  if (guard.error) return guard.error;

  try {
    const { error } = await addLeadNote(sb, leadId, { author: who, body: text });
    if (error) return { status: 500, body: { error: error.message } };
  } catch (err) {
    return { status: 500, body: { error: messageOf(err) } };
  }
  return { status: 200, body: { ok: true } };
}

/**
 * Assign a lead, and optionally set when to come back to it.
 *
 * An empty `assignee` unassigns rather than writing the string "" — an
 * unassigned lead is a real state, and the queue filters on null.
 */
export async function assignPitch(sb, leadId, { assignee, nextActionAt } = {}) {
  const guard = await loadPitchable(sb, leadId);
  if (guard.error) return guard.error;

  const patch = {
    assigned_to: typeof assignee === 'string' && assignee.trim() ? assignee.trim() : null,
  };
  if (nextActionAt !== undefined) {
    if (nextActionAt === null || nextActionAt === '') {
      patch.next_action_at = null;
    } else if (Number.isNaN(Date.parse(String(nextActionAt)))) {
      return { status: 400, body: { error: 'nextActionAt must be an ISO timestamp or null' } };
    } else {
      patch.next_action_at = new Date(String(nextActionAt)).toISOString();
    }
  }

  const { error } = await updateLead(sb, leadId, patch);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true, ...patch } };
}
