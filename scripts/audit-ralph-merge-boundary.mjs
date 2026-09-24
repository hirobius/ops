#!/usr/bin/env node
/**
 * scripts/audit-ralph-merge-boundary.mjs
 *
 * Measures the ops#238 merge boundary directly, over a rolling window of
 * merged PRs: how many touched a supervised path (the revenue path, or the
 * files that define/enforce the boundary itself) WITHOUT carrying
 * `ralph-approved`. PR #368 and PR #362 are exactly this — both merged
 * unattended on 2026-09-16 with zero labels, diffing `api/lead-action.ts` and
 * `lib/leads/pipeline.mjs`. This script turns that spot check into a standing
 * number: the input to ops#238's child-5 decision, and the before/after
 * evidence for the engine-side fix (hirobius/ralph#25).
 *
 * One definition of "supervised", reused not restated: isRevenuePathFile from
 * scripts/metric-north-star-share.mjs (the revenue path) plus
 * BOUNDARY_SELF_PATHS from scripts/ralph-watchdog.mjs (the boundary's own
 * files) — the SAME two the watchdog's own merge path checks.
 *
 * Network required (GitHub Search + REST API) — manual channel only, same as
 * metric-north-star-share and audit-deps.
 *
 * Usage:
 *   node scripts/audit-ralph-merge-boundary.mjs                # last 30 days
 *   node scripts/audit-ralph-merge-boundary.mjs --days 30 --json
 *   node scripts/audit-ralph-merge-boundary.mjs --repo owner/name
 *
 * @module audit-ralph-merge-boundary
 */

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { isRevenuePathFile } from './metric-north-star-share.mjs';
import { BOUNDARY_SELF_PATHS } from './ralph-watchdog.mjs';

/** Applied to a merged PR whose supervised diff a human signed off on. */
export const APPROVE_LABEL = 'ralph-approved';

/** GitHub's hard ceiling on the files `pulls/{n}/files` will ever list. */
const PR_FILES_API_CAP = 3000;
const PR_FILES_PER_PAGE = 100;
const MAX_SEARCH_PAGES = 5; // 5 x 100 = 500 merged PRs, far beyond any 30-90d window
const DEFAULT_WINDOW_DAYS = 30;

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

/** Path counts as supervised when it is revenue-path OR one of the boundary's own files. */
const isSupervisedFile = (path) => isRevenuePathFile(path) || BOUNDARY_SELF_PATHS.includes(path);

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

/** Merged PRs in `repo` since `sinceIso`, with number, mergedAt and label names. */
async function fetchMergedPrs({ repo, token, sinceIso, fetchImpl }) {
  const query = `repo:${repo} is:pr is:merged merged:>=${sinceIso}`;
  let url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100&sort=created&order=asc`;
  const prs = [];
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
    for (const item of body.items ?? []) {
      prs.push({
        number: item.number,
        mergedAt: item.pull_request?.merged_at ?? item.closed_at ?? null,
        labels: (item.labels ?? []).map((l) => l.name),
      });
    }
    const next = parseNextLink(res.headers.get('link'));
    url = next && page < MAX_SEARCH_PAGES ? next : null;
  }
  return prs;
}

/**
 * Every file page for one PR, paginated. Fails closed with `files: null` on
 * any API error or malformed page (transient), and when every page up to
 * GitHub's 3000-file cap comes back full (permanent — the API cannot list
 * the rest) — same two reasons scripts/ralph-watchdog.mjs's own
 * readSupervisedFiles fails closed for, so an unreadable diff is reported as
 * `unknown`, never as clean.
 */
async function fetchPrFiles({ repo, number, token, fetchImpl }) {
  const maxPages = Math.ceil(PR_FILES_API_CAP / PR_FILES_PER_PAGE);
  const files = [];
  for (let page = 1; page <= maxPages; page++) {
    let res;
    try {
      res = await fetchImpl(
        `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=${PR_FILES_PER_PAGE}&page=${page}`,
        { headers: GH_HEADERS(token), signal: AbortSignal.timeout(9000) },
      );
    } catch {
      return { files: null, diffUnreadable: 'api-error' };
    }
    if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
    if (!res.ok) return { files: null, diffUnreadable: 'api-error' };
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) return { files: null, diffUnreadable: 'api-error' };
    for (const f of body) {
      if (typeof f?.filename !== 'string') return { files: null, diffUnreadable: 'api-error' };
      files.push(f.filename);
      if (typeof f.previous_filename === 'string') files.push(f.previous_filename);
    }
    if (body.length < PR_FILES_PER_PAGE) return { files, diffUnreadable: null };
  }
  return { files: null, diffUnreadable: 'file-cap' };
}

/**
 * One classified record per merged PR: whether it is a boundary violation
 * (touched a supervised path, not `ralph-approved`), clean (no supervised
 * file, or approved), or unknown (diff could not be read).
 *
 * @param {{number:number, mergedAt:string|null, labels:string[], files:string[]|null, diffUnreadable:string|null}} pr
 */
export function classifyPr(pr) {
  const base = { number: pr.number, mergedAt: pr.mergedAt };
  if (pr.files === null) {
    return {
      ...base,
      status: 'unknown',
      reason: pr.diffUnreadable === 'file-cap' ? 'file-cap' : 'api-error',
      supervisedFiles: [],
    };
  }
  const supervisedFiles = [...new Set(pr.files.filter((f) => isSupervisedFile(f)))];
  if (supervisedFiles.length === 0) {
    return { ...base, status: 'clean', reason: 'no-supervised-files', supervisedFiles: [] };
  }
  if (pr.labels.includes(APPROVE_LABEL)) {
    return { ...base, status: 'clean', reason: 'ralph-approved', supervisedFiles };
  }
  return { ...base, status: 'violation', reason: 'unattended-supervised-merge', supervisedFiles };
}

/**
 * Canonical-shape violations for a set of classified PRs. `unknown` PRs are
 * reported too (severity `warn`) — an unreadable diff is never treated as
 * clean.
 */
export function buildViolations(classified) {
  return classified
    .filter((c) => c.status !== 'clean')
    .map((c) => ({
      file: '*',
      line: null,
      rule:
        c.status === 'unknown'
          ? 'MERGE_BOUNDARY_DIFF_UNREADABLE'
          : 'MERGE_BOUNDARY_UNATTENDED_MERGE',
      severity: c.status === 'unknown' ? 'warn' : 'error',
      message:
        c.status === 'unknown'
          ? `PR #${c.number} (merged ${c.mergedAt ?? 'unknown date'}): diff could not be read (${c.reason}) — treated as a possible violation, not clean`
          : `PR #${c.number} (merged ${c.mergedAt ?? 'unknown date'}): supervised path merged without ${APPROVE_LABEL} — ${c.supervisedFiles.join(', ')}`,
      pr: c.number,
      mergedAt: c.mergedAt,
      supervisedFiles: c.supervisedFiles,
    }));
}

/**
 * End-to-end: fetch merged PRs in the window, read each one's files, and
 * classify. `fetchImpl` is injectable (defaults to global `fetch`) so tests
 * can stub the API client without network.
 */
export async function runAudit({
  repo,
  token,
  days = DEFAULT_WINDOW_DAYS,
  now = Date.now(),
  fetchImpl = fetch,
}) {
  const sinceIso = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const prs = await fetchMergedPrs({ repo, token, sinceIso, fetchImpl });
  const classified = await Promise.all(
    prs.map(async (pr) => {
      const { files, diffUnreadable } = await fetchPrFiles({
        repo,
        number: pr.number,
        token,
        fetchImpl,
      });
      return classifyPr({ ...pr, files, diffUnreadable });
    }),
  );
  const violations = buildViolations(classified);
  const violationCount = classified.filter((c) => c.status === 'violation').length;
  const unknownCount = classified.filter((c) => c.status === 'unknown').length;
  return {
    violations,
    summary: {
      total: classified.length,
      violations: violationCount,
      unknown: unknownCount,
      clean: classified.length - violationCount - unknownCount,
      windowDays: days,
      repo,
    },
    ok: violations.length === 0,
  };
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
  const repo = strFlag(argv, '--repo', process.env.GITHUB_REPO || 'hirobius/ops');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      `GITHUB_TOKEN is not set — needed to read merged PRs for the merge-boundary audit. ` +
        `Set it in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL}, ` +
        `then redeploy. (A fine-grained token with "Pull requests: read" works: ${GITHUB_TOKEN_URL}.)`,
    );
    process.exit(1);
    return;
  }

  let result;
  try {
    result = await runAudit({ repo, token, days });
  } catch (err) {
    console.error(
      `audit-ralph-merge-boundary: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return;
  }

  if (jsonMode) {
    emitResult(result, true);
  } else {
    console.log(
      `merge-boundary audit: ${result.summary.violations} unattended supervised merge(s), ` +
        `${result.summary.unknown} unreadable diff(s), of ${result.summary.total} merged PR(s) over ${days}d`,
    );
    for (const v of result.violations) console.log(`  ${v.message}`);
  }
  process.exit(result.violations.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
