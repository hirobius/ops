/**
 * lib/compliance/privacy-request.mjs — turn a privacy request into
 * do_not_contact suppression (ops#38, compliance #35/#36).
 *
 * Intake is a human reading the privacy contact inbox
 * (lib/compliance/identity.mjs → PRIVACY_CONTACT_EMAIL). This module is what
 * they run next, via scripts/privacy-request.mjs, so "request → do_not_contact"
 * is one command, not a hand-edited row.
 *
 * `sb` is the service-role client (lib/supabase/server.mjs).
 */

import { BUILDER_HOSTS, SOCIAL_HOSTS } from '../../scripts/lib/outscraper-normalize.mjs';

const PAGE = 1000;
const CANDIDATE_COLUMNS =
  'id, place_id, name, email, phone, website, do_not_contact, suppression_reason, unsubscribed_at';

export const REQUEST_TYPES = Object.freeze(['opt-out', 'delete', 'know']);

/** suppression_reason values this module writes (0007 documents `deletion-request`). */
export const SUPPRESSION_REASONS = Object.freeze({
  'opt-out': 'opt-out-request',
  delete: 'deletion-request',
});

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   type: 'opt-out'|'delete'|'know',
 *   identifiers: { id?: string, email?: string, phone?: string, placeId?: string, website?: string },
 *   apply?: boolean,          false (default) = dry run: report, write nothing
 *   allowMultiple?: boolean,  a request matching more than one lead refuses without it
 *   now?: string,             ISO timestamp (tests); defaults to the current time
 * }} request
 */
export async function runPrivacyRequest(
  sb,
  { type, identifiers, apply = false, allowMultiple = false, now },
) {
  if (!REQUEST_TYPES.includes(type)) {
    throw new Error(`privacy request: type "${type}" must be one of ${REQUEST_TYPES.join(', ')}.`);
  }
  const want = normalizeIdentifiers(identifiers);
  if (!Object.values(want).some(Boolean)) {
    throw new Error(
      'privacy request: give at least one usable identifier — a lead id, a Google place id, ' +
        'an email address, a website, or a phone number with its area code.',
    );
  }

  const at = now ?? new Date().toISOString();
  const matches = await findMatchingLeads(sb, want);

  // One identifier can reach several businesses (a shared phone line, a
  // mis-keyed website), and acting on the wrong one discloses or changes another
  // business's record. So more than one match refuses unless explicitly allowed.
  // A dry run of opt-out or delete still lists every match so the operator can
  // see who they are; a know request has no dry run, its result IS the disclosure.
  if (matches.length > 1 && !allowMultiple && (apply || type === 'know')) {
    throw new Error(
      `privacy request: this ${type} request matches ${matches.length} leads ` +
        `(${matches.map((m) => `${m.id} ${m.name ?? ''}`.trim()).join('; ')}). ` +
        'Narrow it with --id, or pass --allow-multiple if every one of them is the requester.',
    );
  }

  // Know is read-only whatever `apply` says: it answers the request, it changes nothing.
  if (type === 'know') {
    const disclosures = [];
    for (const m of matches) {
      disclosures.push({ record: await readFullLead(sb, m.id), notes: await readNotes(sb, m.id) });
    }
    return { type, applied: false, matches, changes: [], disclosures };
  }

  const changes = [];
  for (const m of matches) {
    if (type === 'delete') {
      const full = await readFullLead(sb, m.id);
      const patch = deletionPatch(full, at);
      changes.push({ lead: m, patch, deletesNotes: true, warnings: deletionWarnings(full) });
      if (apply) {
        await writePatch(sb, m.id, patch);
        const { error } = await sb.from('lead_notes').delete().eq('lead_id', m.id);
        if (error) {
          throw new Error(
            `privacy request: lead ${m.id} was minimized but deleting its notes failed: ${error.message}. ` +
              'Re-run the same request to finish.',
          );
        }
      }
      continue;
    }

    const patch = suppressionPatch(m, SUPPRESSION_REASONS[type], at);
    const warnings = m.email ? [smartleadWarning('unsubscribe it in every campaign')] : [];
    changes.push({ lead: m, patch, deletesNotes: false, warnings });
    if (apply) await writePatch(sb, m.id, patch);
  }

  return { type, applied: apply, matches, changes };
}

/**
 * Columns a deletion keeps. Everything else on the row is nulled — an allowlist,
 * so a PII column added by a future migration is deleted by default rather than
 * silently surviving. `place_id` is what upsertLeads matches to keep a suppressed
 * business from being collected again; the rest carry no information about it.
 */
export const DELETION_KEEPS = Object.freeze([
  'id',
  'created_at',
  'status',
  'place_id',
  'do_not_contact',
  'suppression_reason',
  'unsubscribed_at',
]);

function deletionPatch(full, at) {
  const patch = {};
  for (const col of Object.keys(full)) {
    if (!DELETION_KEEPS.includes(col)) patch[col] = null;
  }
  return {
    ...patch,
    do_not_contact: true,
    // A deletion is recorded as such even over an earlier opt-out: it explains
    // why the row is empty. The earlier date is kept.
    suppression_reason: SUPPRESSION_REASONS.delete,
    unsubscribed_at: full.unsubscribed_at || at,
  };
}

const GIT_HISTORY_CAVEAT =
  'A commit that deletes it leaves it in git history; erasing that takes a history rewrite and force-push (Adrian decides).';

/** What a database update cannot reach. Printed before anything is written. */
function deletionWarnings(full) {
  const warnings = [];
  for (const url of [full.preview_url, full.live_url].filter(Boolean)) {
    warnings.push(
      `A sample site was built for this business: ${url} — take it down (its site-engine app and Vercel project).`,
    );
  }
  if (full.email) warnings.push(smartleadWarning('delete it from every campaign'));
  // Both repos are PUBLIC. Named here, before the write nulls the name, so it can be searched for.
  const who = full.name ? `"${full.name}"` : `place id ${full.place_id ?? full.id}`;
  warnings.push(
    `Search the public hirobius/site-engine repo for ${who}` +
      (full.slug ? ` (start with apps/${full.slug}/ and apps/preview-${full.slug}/)` : '') +
      ` and delete its app, whose client.config.ts copies real lead facts. ${GIT_HISTORY_CAVEAT}`,
  );
  warnings.push(
    `Search the public hirobius/ops repo for ${who} (docs/prospecting/run-log.md names shortlisted leads) ` +
      `and remove it. ${GIT_HISTORY_CAVEAT}`,
  );
  if (full.slug) {
    warnings.push(`Delete the local clients/${full.slug}/ folder (gitignored scrape output).`);
  }
  warnings.push(
    'Search local prospects/ output (gitignored Outscraper batches) for this business and delete it there.',
  );
  if (!full.place_id) {
    warnings.push(
      'This lead has no place id, so the kept record cannot stop the business being collected again. ' +
        'Check the next scrape by hand.',
    );
  }
  return warnings;
}

/**
 * do_not_contact only stops FUTURE pushes. A lead already in a Smartlead campaign
 * keeps getting that sequence's follow-ups until it is removed there, and
 * push-outreach records nothing locally, so only Smartlead knows.
 */
function smartleadWarning(action) {
  return (
    `This lead has an email address. Search Smartlead for it and ${action}: ` +
    'marking it do-not-contact here stops future pushes, not a sequence that is already sending, ' +
    'and push-outreach records nothing locally until the outreach webhook exists.'
  );
}

async function readFullLead(sb, id) {
  const { data, error } = await sb.from('leads').select('*').eq('id', id).single();
  if (error || !data) {
    throw new Error(`privacy request: reading lead ${id} failed: ${error?.message ?? 'not found'}`);
  }
  return data;
}

async function readNotes(sb, leadId) {
  const { data, error } = await sb
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error)
    throw new Error(`privacy request: reading notes for lead ${leadId} failed: ${error.message}`);
  return data ?? [];
}

async function writePatch(sb, id, patch) {
  const { error } = await sb.from('leads').update(patch).eq('id', id);
  if (error) throw new Error(`privacy request: update of lead ${id} failed: ${error.message}`);
}

/**
 * Mark a lead do-not-contact. An earlier opt-out keeps its own reason and date:
 * "unsubscribed on Aug 1" is evidence, and a later request must not overwrite it.
 */
function suppressionPatch(lead, reason, at) {
  return {
    do_not_contact: true,
    suppression_reason: lead.suppression_reason || reason,
    unsubscribed_at: lead.unsubscribed_at || at,
  };
}

/** Every lead matching ANY supplied identifier. Matching is done here, not in SQL, so it can normalize. */
async function findMatchingLeads(sb, want) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('leads')
      .select(CANDIDATE_COLUMNS)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`privacy request: reading leads failed: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows.filter((r) => matches(r, want)));
    if (rows.length < PAGE) break;
  }
  return out;
}

function normalizeIdentifiers({ id, email, phone, placeId, website } = {}) {
  return {
    id: normText(id),
    email: normEmail(email),
    phone: normPhone(phone),
    placeId: normText(placeId),
    website: websiteKey(website),
  };
}

function matches(row, want) {
  return (
    (Boolean(want.id) && row.id === want.id) ||
    (Boolean(want.placeId) && row.place_id === want.placeId) ||
    (Boolean(want.email) && normEmail(row.email) === want.email) ||
    (Boolean(want.phone) && normPhone(row.phone) === want.phone) ||
    (Boolean(want.website) && websiteKey(row.website) === want.website)
  );
}

function normText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normEmail(value) {
  return normText(value).toLowerCase();
}

/**
 * Hosts where one address holds many unrelated businesses: the social, link-in-bio
 * and site-builder hosts lead scoring already knows (outscraper-normalize), plus
 * other platforms a business's listing can point at. On these the host says
 * nothing about who the business is; the path (and query) does.
 */
const SHARED_HOSTS = Object.freeze([
  ...SOCIAL_HOSTS,
  ...BUILDER_HOSTS,
  'google.com',
  'sites.google.com',
  'goo.gl',
  'bit.ly',
  'linkedin.com',
  'youtube.com',
  'pinterest.com',
  'angi.com',
  'homeadvisor.com',
  'houzz.com',
  'thumbtack.com',
  'bbb.org',
  'github.io',
  'webflow.io',
  'carrd.co',
]);

/** Query parameters that track a click rather than name a page. */
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|mibextid|ref|refid|__tn__|igsh|igshid|si)$/i;

/**
 * What a website identifies, for matching.
 *
 * A business's own domain is identified by its host alone, however it is written:
 * "https://www.X.com/services" → "x.com". On a shared host the host is not enough,
 * so the path and any non-tracking query are kept: "facebook.com/alpha-roofing" and
 * "facebook.com/beta-plumbing" are different businesses, and so are two
 * "profile.php?id=" pages. A shared host's bare address names no business at all
 * and matches nothing.
 */
function websiteKey(value) {
  const raw = normText(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  if (!host) return '';
  if (!SHARED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`))) return host;

  const path = url.pathname.toLowerCase().replace(/\/+$/, '');
  const query = [...url.searchParams]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort()
    .join('&');
  const page = path + (query ? `?${query}` : '');
  if (!page && SHARED_HOSTS.includes(host)) return '';
  return host + page;
}

/**
 * Digits only, compared on the last 10 (a US number with or without the +1).
 * Fewer than 10 digits is not enough to identify a business, so it matches nothing.
 */
function normPhone(value) {
  const digits = normText(value).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}
