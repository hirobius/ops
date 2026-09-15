/**
 * lib/leads/pitch.mjs — the pitch queue's stage model.
 *
 * A call sheet, not a CRM. The whole point is moving a lead through five
 * states and writing down what was said; anything richer belongs in GHL, not
 * here.
 *
 * Reuses the `outreach_status` vocabulary migration 0007 already established
 * rather than inventing a parallel one — the compliance doc, the retention
 * purge and the #321 tripwire all read those values.
 *
 * Everything here is pure. The repository does the writing; this decides what
 * a stage change MEANS.
 */

/**
 * Ordered. `queued` is the default for a lead that has a site to show and has
 * not been approached; `bounced` is terminal and set by the mailer, not a
 * person, so it is reachable but never a manual step forward.
 */
export const PITCH_STAGES = /** @type {const} */ ([
  'queued',
  'sent',
  'replied',
  'won',
  'lost',
]);

/** What a human sees, and what each stage actually means for the business. */
export const STAGE_LABEL = {
  queued: 'To pitch',
  sent: 'Pitched',
  replied: 'Replied',
  won: 'Won',
  lost: 'Lost',
  bounced: 'Bounced',
};

/** Terminal stages: no further move, and they drop out of the working queue. */
const TERMINAL = new Set(['won', 'lost', 'bounced']);

/**
 * The timestamp column a stage stamps on arrival.
 *
 * `sent` → `contacted_at` is the load-bearing one: it is the evidence the
 * #321 tripwire evaluates, and the reason `contact_channel` is required
 * alongside it. A call that happens but is never recorded cannot be evaluated
 * on the date.
 */
const STAMP = {
  sent: 'contacted_at',
  replied: 'replied_at',
  won: 'won_at',
  lost: 'lost_at',
};

export function isPitchStage(value) {
  return typeof value === 'string' && PITCH_STAGES.includes(value);
}

export function isTerminal(stage) {
  return TERMINAL.has(stage);
}

/**
 * The patch that moves a lead to `stage`.
 *
 * Existing timestamps are never overwritten — the first time you reached
 * someone is a fact about the world, and re-saving the stage after adding a
 * note should not rewrite it.
 *
 * @param {string} stage
 * @param {{ contactedAt?: string|null, repliedAt?: string|null, wonAt?: string|null, lostAt?: string|null }} current
 * @param {{ channel?: string|null, now?: string }} [opts] `channel` is required moving to `sent`
 * @returns {{ ok: true, patch: Record<string, unknown> } | { ok: false, error: string }}
 */
export function stagePatch(stage, current = {}, opts = {}) {
  if (!isPitchStage(stage)) {
    return { ok: false, error: `stage must be one of: ${PITCH_STAGES.join(', ')}` };
  }

  const now = opts.now ?? new Date().toISOString();
  const patch = { outreach_status: stage };

  if (stage === 'sent') {
    const channel = typeof opts.channel === 'string' ? opts.channel.trim() : '';
    if (!channel) {
      // Refused rather than defaulted: "how did you reach them" is the part of
      // the record that makes the contact auditable later.
      return { ok: false, error: 'contact_channel is required when marking a lead pitched' };
    }
    patch.contact_channel = channel;
  }

  const column = STAMP[stage];
  if (column) {
    const existing = {
      contacted_at: current.contactedAt,
      replied_at: current.repliedAt,
      won_at: current.wonAt,
      lost_at: current.lostAt,
    }[column];
    if (!existing) patch[column] = now;
  }

  return { ok: true, patch };
}

/**
 * Queue order: who to call next.
 *
 * Untouched leads first (that is the job), then by score, then by name so the
 * list is stable between polls. Terminal leads sink to the bottom rather than
 * disappearing — a partner needs to see that a business was already lost
 * before wondering why it is missing.
 *
 * @param {Array<{outreach_status?: string|null, lead_score?: number|null, name?: string|null}>} leads
 */
export function orderPitchQueue(leads) {
  const list = Array.isArray(leads) ? leads : [];
  return [...list].sort((a, b) => {
    const at = isTerminal(a.outreach_status ?? '') ? 1 : 0;
    const bt = isTerminal(b.outreach_status ?? '') ? 1 : 0;
    if (at !== bt) return at - bt;

    const ar = PITCH_STAGES.indexOf(a.outreach_status ?? 'queued');
    const br = PITCH_STAGES.indexOf(b.outreach_status ?? 'queued');
    if (ar !== br) return (ar < 0 ? 0 : ar) - (br < 0 ? 0 : br);

    const as = a.lead_score ?? -1;
    const bs = b.lead_score ?? -1;
    if (as !== bs) return bs - as;

    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}

/**
 * Is this lead pitchable at all?
 *
 * Two hard gates, both compliance rather than preference: a suppressed lead is
 * never contacted again under any campaign (#36), and there is nothing to pitch
 * without a site to show.
 *
 * @param {{do_not_contact?: boolean|null, preview_url?: string|null}} lead
 */
export function isPitchable(lead) {
  if (!lead || lead.do_not_contact) return false;
  return typeof lead.preview_url === 'string' && lead.preview_url.length > 0;
}

/**
 * Counts for the queue header — how many are waiting, working, closed.
 * @param {Array<{outreach_status?: string|null}>} leads
 */
export function pitchSummary(leads) {
  const list = Array.isArray(leads) ? leads : [];
  const count = (fn) => list.filter(fn).length;
  return {
    total: list.length,
    toPitch: count((l) => !l.outreach_status || l.outreach_status === 'queued'),
    inPlay: count((l) => l.outreach_status === 'sent' || l.outreach_status === 'replied'),
    won: count((l) => l.outreach_status === 'won'),
    closed: count((l) => isTerminal(l.outreach_status ?? '')),
  };
}
