#!/usr/bin/env node
/**
 * scripts/sync-preview-urls.mjs — auto-record preview_url on leads (issue #44).
 *
 * Closes the manual-paste nav gap: today, after a client site deploys to Vercel,
 * someone has to hand-paste the preview URL onto the lead's `preview_url` so it
 * shows as the clickable link in /ops Leads (LeadsPage.tsx) and, eventually, the
 * Fleet gallery. This poller removes that hop — it reads live Vercel state and
 * stamps the URL for you.
 *
 * It reuses two seams already built rather than re-implementing either:
 *   - lib/projects/index.mjs::listProjects     one read-only Vercel v9 call
 *                                              (VERCEL_TOKEN / VERCEL_TEAM_ID),
 *                                              already returns each project's
 *                                              latestDeployment {state,url,target}
 *   - lib/supabase/leads.mjs::updateLead        the same write the 'render' action
 *                                              (renderLeadSite) makes by hand:
 *                                              { status:'rendered', preview_url }.
 *                                              We write directly rather than call
 *                                              renderLeadSite because that function
 *                                              also re-emits deploy artifacts via
 *                                              lib/agent (heavy import) — pointless
 *                                              here, where the site is ALREADY
 *                                              deployed and we're reading its URL.
 *
 * Matching key: a scored lead stores its generated ClientConfig in `config`,
 * whose `.slug` is exactly what the clients-repo app (apps/<slug>) — and thus its
 * Vercel project — is named after. We match a project to a lead when the project
 * name, normalized (lowercased, optional `hirobius-` prefix stripped), equals the
 * lead's `config.slug`. Exact-after-normalization only — no fuzzy/substring match,
 * so we never mis-attribute one client's URL to another's lead.
 *
 * Scope (deliberate, first cut): PREVIEW deployments only → status 'rendered' +
 * preview_url. Production deploys (→ live_url / 'published') are a billing
 * milestone done deliberately by the human and are intentionally NOT auto-flipped
 * here; see issue #44 for the follow-up.
 *
 * Idempotent + fill-only: a lead that already has a `preview_url` is skipped, so
 * re-runs never churn or overwrite. Safe to schedule (e.g. in the mayor Routine
 * alongside fleet-dispatch.mjs).
 *
 * Usage:
 *   node scripts/sync-preview-urls.mjs [--max N] [--json] [--apply] [--help]
 *
 * `--dry-run` is the DEFAULT — lists the matches it WOULD record and writes
 * nothing. Pass `--apply` to stamp preview_url (via renderLeadSite), notify, and
 * log the run. `--max N` caps records per run (default 25). `--json` prints
 * machine-readable output.
 *
 * Fail-soft: without VERCEL_TOKEN the Vercel read returns a coded error and this
 * exits 0 after naming the missing var (same graceful pattern as the fleet
 * scripts). Supabase unreachable → exit 1.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { listLeads, updateLead } from '../lib/supabase/leads.mjs';
import { listProjects } from '../lib/projects/index.mjs';
import { appendRun } from '../lib/ops/run-log.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

export const DEFAULT_MAX = 25;
const LEADS_FETCH_LIMIT = 500;
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Normalize a Vercel project name to a comparable slug: lowercase and strip a
 * leading `hirobius-` (the org-prefixed project convention). Bare project names
 * (e.g. `cascade-fence-deck-wa`) pass through unchanged.
 * @param {string} name
 * @returns {string}
 */
export function slugFromProjectName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/^hirobius-/, '');
}

/**
 * The preview URL for a project's latest deployment, or null when it isn't a
 * usable preview: we require a READY state, a non-production target, and a host.
 * Returns a fully-qualified `https://` URL (Vercel's `url` is host-only).
 * @param {{ state?: string, url?: string|null, target?: string|null }|null|undefined} deployment
 * @returns {string|null}
 */
export function previewUrlFromDeployment(deployment) {
  if (!deployment) return null;
  if (deployment.target === 'production') return null; // preview-only (see Scope)
  if (String(deployment.state).toUpperCase() !== 'READY') return null;
  const host = typeof deployment.url === 'string' ? deployment.url.trim() : '';
  if (!host) return null;
  return `https://${host.replace(/^https?:\/\//, '')}`;
}

/**
 * Pure matcher: pair Vercel projects that have a ready preview deployment with
 * leads that carry a matching `config.slug` and no `preview_url` yet. No network,
 * no Date — unit-testable with plain stubs.
 *
 * @param {Array<{ name?: string, latestDeployment?: object|null }>} projects
 * @param {Array<{ id?: string, name?: string|null, preview_url?: string|null, config?: any }>} leads
 * @param {{ max?: number }} [opts]
 * @returns {Array<{ leadId: string, leadName: string|null, slug: string, previewUrl: string }>}
 */
export function matchPreviewUpdates(projects, leads, { max = DEFAULT_MAX } = {}) {
  const cap = Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX;

  // slug -> preview URL, from projects that expose a ready preview deployment.
  const previewBySlug = new Map();
  for (const p of Array.isArray(projects) ? projects : []) {
    const url = previewUrlFromDeployment(p?.latestDeployment);
    if (!url) continue;
    const slug = slugFromProjectName(p?.name);
    if (slug && !previewBySlug.has(slug)) previewBySlug.set(slug, url);
  }

  const updates = [];
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!lead || !lead.id) continue;
    if (lead.preview_url) continue; // fill-only: never overwrite an existing URL
    const slug = typeof lead.config?.slug === 'string' ? lead.config.slug.toLowerCase() : '';
    if (!slug) continue;
    const previewUrl = previewBySlug.get(slug);
    if (!previewUrl) continue;
    updates.push({ leadId: lead.id, leadName: lead.name ?? null, slug, previewUrl });
    if (updates.length >= cap) break;
  }
  return updates;
}

function parseArgs(argv) {
  const o = { max: DEFAULT_MAX, apply: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--max':
        o.max = Number(argv[++i]);
        break;
      case '--apply':
        o.apply = true;
        break;
      case '--dry-run':
        o.apply = false; // explicit no-op — dry-run is already the default
        break;
      case '--json':
        o.json = true;
        break;
      case '--help':
      case '-h':
        o.help = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/sync-preview-urls.mjs — auto-record preview_url on leads (#44)\n\n` +
      `Usage:\n` +
      `  node scripts/sync-preview-urls.mjs [--max N] [--json] [--apply]\n\n` +
      `Matches Vercel projects with a READY preview deployment to leads whose\n` +
      `config.slug equals the (hirobius-stripped) project name and have no\n` +
      `preview_url yet, then stamps preview_url + status='rendered'.\n\n` +
      `--dry-run is the DEFAULT — lists matches, writes nothing. Pass --apply\n` +
      `to record for real (notify + run-log). Preview deploys only; production\n` +
      `(live_url/'published') is intentionally out of scope.\n\n` +
      `Flags:\n` +
      `  --max N     cap records per run (default ${DEFAULT_MAX})\n` +
      `  --apply     perform the writes (default is dry-run/list-only)\n` +
      `  --dry-run   explicit no-op — same as the default\n` +
      `  --json      machine-readable output\n` +
      `  --help      print this usage and exit 0\n`,
  );
}

function fmtUpdates(updates) {
  return updates
    .map((u) => `  ${u.slug}  ${u.previewUrl}  "${u.leadName ?? u.leadId}"`)
    .join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Vercel read first — fail-soft + actionable if the token is missing, before
  // we even touch Supabase (no point querying leads if we can't see deploys).
  const projectsResult = await listProjects();
  if (!projectsResult.ok) {
    if (projectsResult.code === 'ENV_MISSING_VERCEL_TOKEN') {
      console.log(
        `VERCEL_TOKEN is not set — needed to read deployment URLs from Vercel. ` +
          `Add a read-scoped token in Vercel → Settings → Environment Variables ` +
          `(Production), then re-run: ${VERCEL_ENV_URL}. Exiting cleanly (no crash).`,
      );
      process.exit(0);
      return;
    }
    console.error(`Vercel read failed (${projectsResult.code}): ${projectsResult.error}`);
    process.exit(1);
    return;
  }
  const projects = projectsResult.projects;

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    console.error(`Supabase not reachable: ${err.message}`);
    process.exit(1);
    return;
  }

  const { data: leads, error: leadsError } = await listLeads(sb, LEADS_FETCH_LIMIT);
  if (leadsError) {
    console.error(`Supabase query failed: ${leadsError.message}`);
    process.exit(1);
    return;
  }

  const matches = matchPreviewUpdates(projects, leads ?? [], { max: args.max });

  if (args.json) {
    console.log(JSON.stringify({ matched: matches.length, apply: args.apply, updates: matches }, null, 2));
  } else {
    console.log(`Ready preview deployments matched to un-URL'd leads: ${matches.length}`);
    if (matches.length === 0) console.log('Nothing to record.');
    else {
      console.log(`Matches (capped at --max ${args.max}):`);
      console.log(fmtUpdates(matches));
    }
  }

  if (!args.apply) {
    if (!args.json) console.log('\nDry run — no writes. Pass --apply to record preview_url for real.');
    process.exit(0);
    return;
  }

  let recorded = 0;
  for (const u of matches) {
    const nowIso = new Date().toISOString();
    const { error: updateError } = await updateLead(sb, u.leadId, {
      status: 'rendered',
      preview_url: u.previewUrl,
    });
    if (updateError) {
      console.error(`${u.slug}: record failed — ${updateError.message}`);
      continue;
    }

    await notifyEvent({
      ts: nowIso,
      kind: 'completed',
      title: `preview recorded — ${u.leadName ?? u.slug}`,
      detail: `slug=${u.slug} status=rendered`,
      url: u.previewUrl,
    });

    appendRun({
      ts: nowIso,
      actor: 'sync-preview-urls',
      task: '#44',
      outcome: 'recorded',
      summary: `preview_url set for ${u.slug} (${u.previewUrl})`,
    });

    recorded += 1;
    console.log(`${u.slug}: preview_url recorded — ${u.previewUrl}`);
  }

  console.log(`\nRecorded ${recorded}/${matches.length} preview URL(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
