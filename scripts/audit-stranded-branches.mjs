#!/usr/bin/env node
/**
 * scripts/audit-stranded-branches.mjs
 *
 * Measures the ops#407 "stranded work" class across the fleet: every remote
 * branch that has NEVER had a pull request, in any state. A branch with no PR
 * is invisible to every surface this fleet has — /ops/standing reads issues
 * and PRs, the Ralph watchdog reads open PRs, `gh pr list` returns nothing —
 * so pushed work can sit unseen for months (se#84 sat two months this way).
 *
 * DoD amendment (adr-eng, 2026-09-19, issue comment): exclude each repo's
 * ACTUAL default branch as reported by the API, never a hardcoded `main` —
 * two of the six fleet repos (`folio`, `concrete`) do not use `main` as their
 * default, and a hardcoded check produces exactly the two false positives the
 * first pass of this audit hit.
 *
 * REPORTING ONLY. It never fails its own exit code and never blocks a commit
 * — see the module's `ok: true` below and the CLI's fixed `process.exit(0)`
 * on a live run. It does not delete branches or open PRs; a human acts on the
 * report (see the issue's "Out of scope").
 *
 * Network required (GitHub REST API) — manual/ci-scheduled channel only, same
 * as metric-north-star-share and audit-ralph-merge-boundary.
 *
 * Usage:
 *   node scripts/audit-stranded-branches.mjs                # human output
 *   node scripts/audit-stranded-branches.mjs --json          # canonical shape
 *   node scripts/audit-stranded-branches.mjs --repos ops,hds # override the fleet list
 *   node scripts/audit-stranded-branches.mjs --fixture-mode  # FIXTURE_FILE=<world.json>, no network
 *
 * @module audit-stranded-branches
 */

import { readFileSync } from 'node:fs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { auditWorld, buildViolations } from '../lib/ops/stranded-branches.mjs';

/** The fleet, per docs/ai/SESSION-BOARD.md / the issue's own evidence trail. */
export const FLEET_REPOS = ['ops', 'site-engine', 'hds', 'Ralph', 'folio', 'concrete'];
const OWNER = 'hirobius';

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

function authHint(status) {
  return (
    `GitHub returned ${status}. GITHUB_TOKEN is expired, revoked, or missing the ` +
    `"Contents: read" + "Pull requests: read" permission — rotate it at ${GITHUB_TOKEN_URL}, ` +
    `then set it in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL} ` +
    `and redeploy.`
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

async function getJson(url, { token, fetchImpl }) {
  const res = await fetchImpl(url, {
    headers: GH_HEADERS(token),
    signal: AbortSignal.timeout(9000),
  });
  if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${url}${text ? ` — ${text.slice(0, 300)}` : ''}`);
  }
  return { body: await res.json(), headers: res.headers };
}

/** The repo's actual default branch — never assumed. */
async function fetchDefaultBranch({ owner, repo, token, fetchImpl }) {
  const { body } = await getJson(`https://api.github.com/repos/${owner}/${repo}`, {
    token,
    fetchImpl,
  });
  return body.default_branch;
}

/** Every branch name on the repo, paginated. */
async function fetchAllBranchNames({ owner, repo, token, fetchImpl }) {
  let url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
  const names = [];
  while (url) {
    const { body, headers } = await getJson(url, { token, fetchImpl });
    for (const b of body) names.push(b.name);
    url = parseNextLink(headers.get('link'));
  }
  return names;
}

/** True when a PR has ever existed (any state) with this branch as head. */
async function hasAnyPr({ owner, repo, branch, token, fetchImpl }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&per_page=1`;
  const { body } = await getJson(url, { token, fetchImpl });
  return Array.isArray(body) && body.length > 0;
}

/** Commits-ahead + divergence status against the default branch, plus the tip's commit date. */
async function fetchCompareAndDetail({ owner, repo, branch, defaultBranch, token, fetchImpl }) {
  const [compare, detail] = await Promise.all([
    getJson(
      `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch)}`,
      { token, fetchImpl },
    ),
    getJson(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      {
        token,
        fetchImpl,
      },
    ),
  ]);
  return {
    aheadBy: typeof compare.body.ahead_by === 'number' ? compare.body.ahead_by : null,
    compareStatus: compare.body.status ?? null,
    lastCommitDate:
      detail.body?.commit?.commit?.committer?.date ??
      detail.body?.commit?.commit?.author?.date ??
      null,
  };
}

/** Gathers one repo's "world" (default branch + per-branch facts) from the GitHub API. */
export async function gatherRepoWorld({ owner, repo, token, fetchImpl }) {
  const defaultBranch = await fetchDefaultBranch({ owner, repo, token, fetchImpl });
  const names = await fetchAllBranchNames({ owner, repo, token, fetchImpl });
  const branches = [];
  for (const name of names) {
    if (name === defaultBranch) continue; // excluded by definition, no PR check needed
    const hasPr = await hasAnyPr({ owner, repo, branch: name, token, fetchImpl });
    if (hasPr) {
      branches.push({ name, hasPr: true });
      continue;
    }
    // No PR ever — pattern-excluded classes (ralph/claim-*, archive/*) don't
    // need the extra compare/detail calls; the pure layer excludes them by
    // name regardless, so skip the network round-trip for them here too.
    if (/^ralph\/claim-/.test(name) || /^archive\//.test(name)) {
      branches.push({ name, hasPr: false });
      continue;
    }
    const rest = await fetchCompareAndDetail({
      owner,
      repo,
      branch: name,
      defaultBranch,
      token,
      fetchImpl,
    });
    branches.push({ name, hasPr: false, ...rest });
  }
  return { repo, defaultBranch, branches };
}

/** Fetches the world for every repo and runs the pure classifier over it. */
export async function runAudit({ repos = FLEET_REPOS, owner = OWNER, token, fetchImpl = fetch }) {
  const repoWorlds = [];
  for (const repo of repos) {
    repoWorlds.push(await gatherRepoWorld({ owner, repo, token, fetchImpl }));
  }
  return buildResult(auditWorld({ repos: repoWorlds }));
}

function buildResult(audit) {
  const violations = buildViolations(audit);
  return {
    violations,
    summary: {
      totalStranded: audit.stranded.length,
      byRepo: Object.fromEntries(audit.perRepo.map((r) => [r.repo, r.stranded.length])),
      issuesWithStrandedBranch: audit.issuesWithStrandedBranch,
    },
    // Reporting gate — never fails its own run. 85+ findings on day one would
    // wedge every push if this drove an exit code the same way an `error`
    // severity gate does (see the issue's DoD).
    ok: true,
  };
}

function formatHuman(result) {
  const lines = [
    `stranded-branch audit: ${result.summary.totalStranded} branch(es) with no PR ever, across ${Object.keys(result.summary.byRepo).length} repo(s)`,
  ];
  for (const v of result.violations) lines.push(`  ${v.message}`);
  if (result.summary.issuesWithStrandedBranch.length) {
    lines.push(
      `  issues with a stranded branch: ${result.summary.issuesWithStrandedBranch.map((n) => `#${n}`).join(', ')}`,
    );
  }
  return lines.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function listFlag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';

  if (fixtureMode) {
    const fixtureFile = process.env.FIXTURE_FILE;
    if (!fixtureFile) {
      process.stderr.write('audit-stranded-branches: --fixture-mode requires FIXTURE_FILE\n');
      process.exit(2);
      return;
    }
    let world;
    try {
      world = JSON.parse(readFileSync(fixtureFile, 'utf8'));
    } catch (err) {
      process.stderr.write(`audit-stranded-branches: cannot read fixture: ${err.message}\n`);
      process.exit(2);
      return;
    }
    const result = buildResult(auditWorld(world));
    if (jsonMode) emitResult(result, true);
    else process.stdout.write(formatHuman(result) + '\n');
    // Fixture mode signals firing via exit code so
    // validate-fixture-proof-of-firing can prove the rule actually fires.
    process.exit(result.violations.length > 0 ? 1 : 0);
    return;
  }

  const repos = listFlag(argv, '--repos', FLEET_REPOS);
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      `GITHUB_TOKEN is not set — needed to read branches and PRs for the stranded-branch audit. ` +
        `Set it in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL}, ` +
        `then redeploy. (A fine-grained token with "Contents: read" + "Pull requests: read" works: ${GITHUB_TOKEN_URL}.)`,
    );
    process.exit(1);
    return;
  }

  let result;
  try {
    result = await runAudit({ repos, token });
  } catch (err) {
    console.error(`audit-stranded-branches: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  if (jsonMode) emitResult(result, true);
  else console.log(formatHuman(result));
  process.exit(0); // reporting gate — never blocks
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
