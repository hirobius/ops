#!/usr/bin/env node
/**
 * scripts/metric-north-star-share.mjs
 *
 * North-star share metric (ops#293, decided in the ops#274 frontier-engineering
 * session). Over a rolling window (default 14 days), the share of merged PRs
 * whose diff touches the revenue path — lead intake through outreach.
 *
 * The point: PR-count / commit-count metrics reward activity, not outcome. On
 * 2026-09-14 the loop merged 15 PRs, 0 of which touched the revenue path,
 * while p0 #185 sat 64 days unqueued — nothing surfaced that. This instrument
 * does.
 *
 * REVENUE_PATH_PREFIXES is the one reviewable definition of "revenue path" —
 * changing what counts is a deliberate edit to this constant, not a drifting
 * interpretation. It is also the #238 supervised-path merge boundary, reused
 * (not duplicated) by scripts/ralph-watchdog.mjs — so an edit here changes
 * what may merge unattended, not only what the metric counts. That is why this
 * file is itself supervised (BOUNDARY_SELF_PATHS in scripts/ralph-watchdog.mjs):
 * an edit to it cannot merge without ralph-approved either.
 *
 * What the list does and does not cover: every runtime source that reads or
 * writes the do-not-contact flag is on it (pinned by a test that greps for it),
 * as are the send, the lead store and intake APIs, and site generation. It is
 * NOT a lead-PII boundary — other scripts read lead rows or contact data
 * (e.g. rescore-leads, export-agent-lead, sync-client-emails) and are not listed.
 *
 * DEFAULT_TARGET_SHARE is a starting instrument threshold, not a calibrated
 * policy — Adrian can retune it (or pass --target) once a few windows of
 * real data exist. It only affects whether a violation is emitted for
 * ralph/metric.sh; it never fails this script's own exit code (informational
 * metric, no dashboard surface yet — see ops#293 "out of scope").
 *
 * Network required (GitHub Search + REST API) — manual channel only, same
 * as audit-deps.
 *
 * Usage:
 *   node scripts/metric-north-star-share.mjs                 # last 14 days, human output
 *   node scripts/metric-north-star-share.mjs --days 30
 *   node scripts/metric-north-star-share.mjs --json           # canonical { violations, summary, ok }
 *   node scripts/metric-north-star-share.mjs --target 0.2     # violation when share < 20%
 *   node scripts/metric-north-star-share.mjs --repo owner/name
 *
 * @module metric-north-star-share
 */

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

// ── Revenue path definition ──────────────────────────────────────────────────

/**
 * The reviewable list of path prefixes that count as "revenue path" — lead
 * intake, site generation/render, outreach, and the leads UI surface. A file
 * counts as a match when its repo-relative path starts with one of these.
 */
export const REVENUE_PATH_PREFIXES = [
  'lib/agent/',
  'lib/leads/',
  'lib/lead-gen/',
  'lib/render/',
  'lib/outreach/',
  'api/lead-action.ts',
  'src/app/pages/ops/leads/',
  // Added 2026-09-15 with /ops/pitch: the call sheet is where a built site
  // becomes a conversation, which is as revenue-path as the generator.
  'src/app/pages/ops/pitch/',
  // Added 2026-09-16 (Adrian, ops#238): the real send, the lead store, and the
  // lead intake API. This list is also the watchdog's supervised-path merge
  // boundary (scripts/ralph-watchdog.mjs), so these now need ralph-approved to
  // merge unattended, not just count toward the metric.
  'scripts/push-outreach.mjs',
  'lib/supabase/leads.mjs',
  'api/leads.ts',
  'api/pull-leads.ts',
  // Added 2026-09-16 (ops#375 review): the other scripts that honour or set the
  // do-not-contact flag (crawler eligibility, call list, call log, the purge
  // that keeps opt-out tombstones), and the no-API site generator's CLI.
  'scripts/crawl-lead-emails.mjs',
  'scripts/export-call-list.mjs',
  'scripts/log-call.mjs',
  'scripts/purge-stale-leads.mjs',
  'scripts/generate-lead-site.mjs',
];

/** Starting instrument threshold — see module header. */
export const DEFAULT_TARGET_SHARE = 0.2;

/** Rolling window default, matching the ops#293 spec. */
export const DEFAULT_WINDOW_DAYS = 14;

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

/** True when `filePath` falls under one of `prefixes` (default REVENUE_PATH_PREFIXES). */
export function isRevenuePathFile(filePath, prefixes = REVENUE_PATH_PREFIXES) {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

/**
 * @param {string[][]} prFileLists  One changed-files array per merged PR.
 * @param {string[]} [prefixes]
 * @returns {{ total: number, touching: number, share: number|null }}
 *   share is null (not 0) when there were no merged PRs in the window — an
 *   empty window is "no data", not "0% revenue-path".
 */
export function computeShare(prFileLists, prefixes = REVENUE_PATH_PREFIXES) {
  const total = prFileLists.length;
  const touching = prFileLists.filter((files) =>
    files.some((f) => isRevenuePathFile(f, prefixes)),
  ).length;
  return { total, touching, share: total === 0 ? null : touching / total };
}

/**
 * Canonical-shape violations for the computed share. Empty window or a share
 * at/above target → no violations. Below target → exactly one, so
 * `ralph/metric.sh` (which counts `violations.length`) can drive off it.
 */
export function buildViolations({ share, targetShare = DEFAULT_TARGET_SHARE }) {
  if (share === null || share >= targetShare) return [];
  return [
    {
      file: '*',
      line: null,
      rule: 'NORTH_STAR_SHARE_BELOW_TARGET',
      severity: 'warn',
      message: `north-star share ${(share * 100).toFixed(1)}% is below target ${(targetShare * 100).toFixed(1)}%`,
    },
  ];
}

/** `north-star share: N/M merged PRs (X%) over 14d` — the human-readable line the DoD asks for. */
export function formatHuman({ touching, total, share, windowDays }) {
  const pct = share === null ? 'n/a' : `${(share * 100).toFixed(1)}%`;
  return `north-star share: ${touching}/${total} merged PRs (${pct}) over ${windowDays}d`;
}

// ── GitHub fetch (network) ───────────────────────────────────────────────────

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

function authHint(status) {
  return (
    `GitHub returned ${status}. GITHUB_TOKEN is expired, revoked, or missing the ` +
    `"Pull requests: read" permission — rotate it at ${GITHUB_TOKEN_URL}, then set it in ` +
    `Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL} and redeploy.`
  );
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

const MAX_SEARCH_PAGES = 5; // 5 × 100 = 500 merged PRs — far beyond any 14d window
const MAX_FILES_PAGES = 3; // 3 × 100 = 300 changed files per PR

/** Merged PR numbers in `repo` with `merged: >= sinceIso`, via the Search API. */
async function fetchMergedPrNumbers({ repo, token, sinceIso, fetchImpl }) {
  const query = `repo:${repo} is:pr is:merged merged:>=${sinceIso}`;
  let url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100&sort=created&order=asc`;
  const numbers = [];
  let page = 0;
  while (url) {
    page += 1;
    const res = await fetchImpl(url, {
      headers: GH_HEADERS(token),
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `HTTP ${res.status} searching merged PRs${text ? ` — ${text.slice(0, 300)}` : ''}`,
      );
    }
    const body = await res.json();
    for (const item of body.items ?? []) numbers.push(item.number);
    const next = parseNextLink(res.headers.get('link'));
    url = next && page < MAX_SEARCH_PAGES ? next : null;
  }
  return numbers;
}

/** Repo-relative changed-file paths for one PR, paginated. */
async function fetchPrFiles({ repo, number, token, fetchImpl }) {
  let url = `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100`;
  const files = [];
  let page = 0;
  while (url) {
    page += 1;
    const res = await fetchImpl(url, {
      headers: GH_HEADERS(token),
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `HTTP ${res.status} fetching files for PR #${number}${text ? ` — ${text.slice(0, 300)}` : ''}`,
      );
    }
    const body = await res.json();
    for (const f of body) files.push(f.filename);
    const next = parseNextLink(res.headers.get('link'));
    url = next && page < MAX_FILES_PAGES ? next : null;
  }
  return files;
}

/**
 * One changed-files array per PR merged in `repo` within the last `days`
 * days. `fetchImpl` is injectable (defaults to global `fetch`) so tests can
 * stub the API client without network (ops#293 DoD).
 * @returns {Promise<string[][]>}
 */
export async function fetchMergedPRsWithFiles({
  repo,
  token,
  days = DEFAULT_WINDOW_DAYS,
  now = Date.now(),
  fetchImpl = fetch,
}) {
  const sinceIso = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const numbers = await fetchMergedPrNumbers({ repo, token, sinceIso, fetchImpl });
  return Promise.all(numbers.map((number) => fetchPrFiles({ repo, number, token, fetchImpl })));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function numFlag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

function strFlag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const days = numFlag(argv, '--days', DEFAULT_WINDOW_DAYS);
  const targetShare = numFlag(argv, '--target', DEFAULT_TARGET_SHARE);
  const repo = strFlag(argv, '--repo', process.env.GITHUB_REPO || 'hirobius/ops');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      `GITHUB_TOKEN is not set — needed to read merged PRs for the north-star share metric. ` +
        `Set it in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL}, ` +
        `then redeploy. (A fine-grained token with "Pull requests: read" works: ${GITHUB_TOKEN_URL}.)`,
    );
    process.exit(1);
    return;
  }

  let prFileLists;
  try {
    prFileLists = await fetchMergedPRsWithFiles({ repo, token, days });
  } catch (err) {
    console.error(`metric-north-star-share: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  const { total, touching, share } = computeShare(prFileLists);
  const violations = buildViolations({ share, targetShare });
  const result = {
    violations,
    summary: { total, touching, share, windowDays: days, targetShare, repo },
    ok: true, // informational metric — never fails its own run; see module header
  };

  if (jsonMode) {
    emitResult(result, true);
  } else {
    console.log(formatHuman({ touching, total, share, windowDays: days }));
    if (violations.length) console.log(`  ${violations[0].message}`);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
