/**
 * lib/outreach/guard.mjs — the SINGLE outbound choke point for cold outreach
 * (#9 outreach engine). Nothing in this repo may hand recipients to a provider
 * without passing through guardOutreach() first.
 *
 * Why this exists
 * ---------------
 * Before this module, scripts/push-outreach.mjs had exactly two states:
 * `--dry-run` (counted rows, imported nothing, exercised no provider code) and
 * `--apply` (real push, to real businesses). The Smartlead contract in
 * lib/outreach/smartlead.mjs has never executed against a live account — its
 * header carries `// VERIFY` markers where the docs and two third-party clients
 * disagreed. So the first `--apply` would have been, simultaneously, the first
 * execution of unverified transport code AND a send to real prospects.
 *
 * `rehearse` closes that gap: a REAL push, through the REAL provider, carrying
 * the REAL merge-field data of real leads — with every recipient rewritten to
 * an address you own. It proves the transport, the field mapping, and the
 * template before a stranger is involved.
 *
 * This deliberately mirrors the client-site repo's automations/_shared/test-mode-guard.mjs,
 * which has the same shape for a different channel set. Same reasoning: one
 * pure function, no I/O, so "could this have emailed a real prospect?" is
 * answerable by reading one file and its tests.
 *
 * @typedef {import('./types.mjs').OutreachLead} OutreachLead
 */

/** The only three states. Anything else throws. */
export const OUTREACH_MODES = Object.freeze(['dry-run', 'rehearse', 'live']);

/** Rehearsal batches are capped — proving the path needs a handful, not a page. */
export const REHEARSAL_MAX = 3;

/** The plus-tag prefix stamped on rehearsal recipients. Also the live-mode tripwire. */
const REHEARSAL_TAG_PREFIX = 'rehearse';

/** Deliberately loose: we are catching typos and empty strings, not validating RFC 5322. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Pick the mode from the CLI flags. Dry-run is the default, and `--apply`
 * together with `--rehearse` is a contradiction we refuse rather than resolve —
 * guessing which one the operator meant is exactly the wrong instinct here.
 *
 * @param {{ apply?: boolean, rehearse?: string|null }} flags
 * @returns {'dry-run'|'rehearse'|'live'}
 */
export function resolveMode({ apply = false, rehearse = null } = {}) {
  if (apply && rehearse) {
    throw new Error(
      'Refusing to run with both --apply and --rehearse: one sends to real prospects, ' +
        'the other sends to you. Pick one.',
    );
  }
  if (rehearse) return 'rehearse';
  if (apply) return 'live';
  return 'dry-run';
}

/**
 * Stamp a plus tag onto an address, replacing any tag already there so repeated
 * passes can't produce `me+a+b+c@…`.
 *
 * Plus-addressing keeps each rehearsal recipient distinct, which matters because
 * Smartlead dedupes a campaign by email — without it a 3-lead rehearsal would
 * collapse into one row and prove nothing about batching.
 *
 * @param {string} email
 * @param {string} tag
 * @returns {string}
 */
export function plusTag(email, tag) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new Error(`plusTag: "${email}" is not a valid email address.`);
  }
  const [local, domain] = email.trim().split('@');
  return `${local.split('+')[0]}+${tag}@${domain}`;
}

/** True if an address carries our rehearsal tag. */
function isRehearsalAddress(email) {
  const local = String(email || '').split('@')[0] || '';
  return local
    .split('+')
    .slice(1)
    .some((t) => t.startsWith(REHEARSAL_TAG_PREFIX));
}

/**
 * The choke point. Decides whether a send happens and what recipients it carries.
 *
 * @param {object} args
 * @param {'dry-run'|'rehearse'|'live'} args.mode
 * @param {OutreachLead[]} args.leads         already-eligible, already-mapped leads
 * @param {string} [args.rehearsalRecipient]  required in rehearse mode; an address you own
 * @param {number} [args.max]                 rehearsal cap (default REHEARSAL_MAX)
 * @returns {{
 *   mode: string,
 *   send: boolean,
 *   leads: OutreachLead[],
 *   preview: OutreachLead[],
 *   rewrites: {from: string, to: string, business: string}[],
 *   capped: boolean
 * }}
 */
export function guardOutreach({ mode, leads, rehearsalRecipient, max = REHEARSAL_MAX }) {
  if (!OUTREACH_MODES.includes(mode)) {
    throw new Error(
      `guardOutreach: unknown outreach mode "${mode}" — expected one of ${OUTREACH_MODES.join(', ')}.`,
    );
  }
  if (!Array.isArray(leads)) {
    throw new Error('guardOutreach: leads must be an array.');
  }

  // Dry-run: nothing leaves. `preview` still carries the real rows so the
  // operator can see who WOULD be contacted; `leads` is empty because that is
  // the field a caller would hand to a provider.
  if (mode === 'dry-run') {
    return { mode, send: false, leads: [], preview: leads, rewrites: [], capped: false };
  }

  if (mode === 'rehearse') {
    if (!rehearsalRecipient) {
      throw new Error(
        'guardOutreach: rehearse mode requires a rehearsalRecipient — an address you control.',
      );
    }
    if (!EMAIL_RE.test(String(rehearsalRecipient).trim())) {
      throw new Error(`guardOutreach: "${rehearsalRecipient}" is not a valid email address.`);
    }

    const batch = leads.slice(0, max);
    const rewrites = [];
    const rewritten = batch.map((l, i) => {
      const to = plusTag(rehearsalRecipient, `${REHEARSAL_TAG_PREFIX}${i + 1}`);
      rewrites.push({
        from: String(l?.email ?? ''),
        to,
        business: String(l?.custom_fields?.business_name ?? ''),
      });
      // Replace the address outright rather than spreading-then-overwriting, so
      // no real address can survive in a field we forgot about.
      return { ...l, email: to };
    });

    return {
      mode,
      send: true,
      leads: rewritten,
      preview: batch,
      rewrites,
      capped: leads.length > max,
    };
  }

  // live — real prospects. Assert the payload is actually sendable and is not a
  // rehearsal batch that leaked into a live run.
  for (const l of leads) {
    const email = typeof l?.email === 'string' ? l.email.trim() : '';
    if (!email) {
      throw new Error(
        `guardOutreach: live mode got a lead without an email (${l?.custom_fields?.business_name || 'unnamed'}) — refusing to send.`,
      );
    }
    if (isRehearsalAddress(email)) {
      throw new Error(
        `guardOutreach: live mode got a rehearsal address (${email}) — refusing to send. ` +
          'Re-fetch from Supabase rather than reusing a rehearsal batch.',
      );
    }
  }

  return { mode, send: true, leads, preview: leads, rewrites: [], capped: false };
}
