/**
 * lib/leads/call-list.mjs — who to dial next, and what to say when they answer.
 * Pure: no network, no client, no I/O.
 *
 * The call channel is NOT the email channel with a different verb, and the
 * eligibility rules are deliberately different:
 *
 *   - Email requires `lead_score >= 60`, which (post-reweight) requires a custom
 *     -domain lead to have been PageSpeed-audited first. Calls do not. You can
 *     phone a business whose site you have merely looked at, so gating the call
 *     queue on the audit would idle 223 perfectly callable leads.
 *   - Email requires an address. 260 of 263 leads have a phone and no email, so
 *     for most of this list the phone IS the only channel.
 *   - Email sends once. Calls repeat, so eligibility has to reason about attempt
 *     counts and callback times, not just a status.
 */

/** Outcomes that mean "never dial this number again". */
export const TERMINAL_OUTCOMES = Object.freeze([
  'not-interested',
  'wrong-number',
  'disconnected',
  'do-not-call',
  'meeting-booked', // advanced out of the cold queue — it's a real conversation now
]);

/** Outcomes that mean "dial again later". */
export const RETRY_OUTCOMES = Object.freeze(['no-answer', 'voicemail', 'gatekeeper']);

/** Dials before a lead is retired unanswered. Four is the usual cold-calling ceiling. */
export const MAX_CALL_ATTEMPTS = 4;

/**
 * Is this lead dialable right now?
 * @param {Record<string, unknown>} lead
 * @param {Date} [now]
 * @returns {{ eligible: boolean, reason: string }}
 */
export function callEligibility(lead, now = new Date()) {
  const l = lead ?? {};
  const phone = typeof l.phone === 'string' ? l.phone.trim() : '';

  if (!phone) return { eligible: false, reason: 'no phone number' };
  if (l.do_not_contact === true)
    return { eligible: false, reason: `suppressed (${l.suppression_reason || 'do_not_contact'})` };
  if (l.operational === false) return { eligible: false, reason: 'permanently closed' };
  if (TERMINAL_OUTCOMES.includes(String(l.call_outcome)))
    return { eligible: false, reason: `resolved (${l.call_outcome})` };
  if ((Number(l.call_attempts) || 0) >= MAX_CALL_ATTEMPTS)
    return { eligible: false, reason: `${MAX_CALL_ATTEMPTS} attempts, no contact` };

  // A requested callback is a commitment; dialling before it is worse than not
  // dialling at all, so it suppresses the lead until its time comes.
  if (l.callback_at) {
    const when = new Date(l.callback_at);
    if (Number.isFinite(when.getTime()) && when > now) {
      return {
        eligible: false,
        reason: `callback scheduled ${when.toISOString().slice(0, 16).replace('T', ' ')}`,
      };
    }
  }

  return { eligible: true, reason: '' };
}

/**
 * The opening line, derived from what we actually know — never invented.
 *
 * site_issues is written by scripts/audit-sites.mjs; migration 0006's own comment
 * says those gripes "double as outreach hooks", and this is where that cashes in.
 * Where there is no audit, the hook falls back to a fact we can see from the Maps
 * listing alone. It returns null rather than a generic line when we know nothing
 * specific, because a fabricated observation is worse than an honest cold open.
 *
 * @param {Record<string, unknown>} lead
 * @returns {{ hook: string, basis: string } | null}
 */
export function callHook(lead) {
  const l = lead ?? {};
  const issues = Array.isArray(l.site_issues)
    ? l.site_issues.filter((i) => typeof i === 'string' && i.trim())
    : [];

  if (issues.length) {
    return { hook: issues[0], basis: 'pagespeed-audit' };
  }
  if (l.site_mobile_friendly === false) {
    return { hook: 'their site is not mobile-friendly', basis: 'pagespeed-audit' };
  }
  if (l.site_https === false) {
    return { hook: 'their site is not served over HTTPS', basis: 'pagespeed-audit' };
  }
  if (l.site_presence === 'none') {
    return { hook: 'no website at all on their Google listing', basis: 'maps-listing' };
  }
  if (l.site_presence === 'social-only') {
    return { hook: 'their Google listing points at social, not a website', basis: 'maps-listing' };
  }
  return null; // unaudited custom/builder site — we have not looked, so we do not claim to
}

/**
 * Call-queue priority. Deliberately NOT lead_score: that score is tuned for the
 * email channel and, for a custom domain, is mostly a function of an audit that
 * may not have run. What makes a good CALL is a specific true thing to open with,
 * plus evidence the business is real enough to answer a phone.
 *
 * @param {Record<string, unknown>} lead
 * @returns {number}
 */
export function callPriority(lead) {
  const l = lead ?? {};
  const hook = callHook(l);

  // An audited hook is the strongest opener available, and it is the one thing
  // that turns a cold call into an observation.
  let score = 0;
  if (hook?.basis === 'pagespeed-audit') score += 50;
  else if (hook?.basis === 'maps-listing') score += 25;

  // Reviews stand in for "this is an established business with real customers" —
  // log-scaled so a 1,000-review outlier doesn't swamp the ordering.
  const reviews = Number(l.review_count) || 0;
  if (reviews > 0) score += Math.min(30, Math.round(Math.log10(reviews + 1) * 10));

  // Never dialled beats already dialled, at equal quality.
  score -= (Number(l.call_attempts) || 0) * 10;

  return score;
}

/**
 * Build the ordered call queue.
 * @param {Record<string, unknown>[]} leads
 * @param {{ limit?: number, now?: Date }} [opts]
 */
export function buildCallList(leads, { limit = 100, now = new Date() } = {}) {
  const rows = (leads ?? []).map((l) => ({ lead: l, ...callEligibility(l, now) }));
  const eligible = rows
    .filter((r) => r.eligible)
    .map((r) => ({
      lead: r.lead,
      priority: callPriority(r.lead),
      hook: callHook(r.lead),
    }))
    .sort((a, b) => b.priority - a.priority);

  const skippedReasons = {};
  for (const r of rows.filter((x) => !x.eligible)) {
    skippedReasons[r.reason] = (skippedReasons[r.reason] || 0) + 1;
  }

  return {
    queue: eligible.slice(0, limit),
    eligibleTotal: eligible.length,
    skipped: rows.length - eligible.length,
    skippedReasons,
    withHook: eligible.slice(0, limit).filter((e) => e.hook).length,
  };
}
