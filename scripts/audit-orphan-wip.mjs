#!/usr/bin/env node
/** @internal — informational audit, channel: manual. */
/**
 * scripts/audit-orphan-wip.mjs
 *
 * Scans every branch ahead of main and reports which feature branches have
 * commits NOT linked to a Hermes Kanban task via a `Refs:` line. Companion
 * to scripts/check-commit-message-task-ref.mjs, which catches new orphans
 * pre-commit; this script catches the existing backlog.
 *
 * Output: docs/guardrails/orphan-wip-report.json (machine) + a human summary
 * to stdout. Always exit 0 — purely informational.
 *
 * Categorization per branch:
 *   - tracked       at least one commit has a valid `Refs:` to an open task
 *   - partial       some commits ref'd, others not
 *   - orphan        no commits ref any task (or all refs stale/archived)
 *   - skipped       branch is main / release/* / hotfix/* / detached
 *
 * Categorization per ref:
 *   - open          task exists in kanban.db with non-archived status
 *   - archived      task exists in kanban.db, status=archived
 *   - unknown       t_-prefixed but not in kanban.db (likely typo/stale)
 *   - legacy        1[0-9][a-z]-N format (lives in frozen orchestration.json)
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const HOME = process.env.HOME ?? '/home/adrian';
const KANBAN_DB = join(HOME, '.hermes/kanban.db');
const REPORT_PATH = join(ROOT, 'docs/guardrails/orphan-wip-report.json');

const _REF_RE = /^Refs:\s*(t_[a-z0-9]+|1[0-9][a-z]-[0-9]+)\s*$/im;
const REF_RE_GLOBAL = /^Refs:\s*(t_[a-z0-9]+|1[0-9][a-z]-[0-9]+)\s*$/gim;

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has('--json');
const VERBOSE = args.has('--verbose');

// ── Step 1: enumerate branches ──────────────────────────────────────────────

function _git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function isProtectedBranch(name) {
  return (
    name === 'main' ||
    name.startsWith('release/') ||
    name.startsWith('hotfix/') ||
    name.startsWith('(HEAD')
  );
}

function listBranchesAheadOfMain() {
  // local branches only (avoid duplicating origin/* refs).
  // Single-quote the format string so /bin/sh doesn't parse the parens.
  const raw = execSync("git for-each-ref --format='%(refname:short)' refs/heads/", {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  return raw
    .split('\n')
    .filter(Boolean)
    .filter((b) => !isProtectedBranch(b));
}

function commitsAheadOfMain(branch) {
  try {
    const raw = execSync(`git log main..${branch} --format=%H%x00%s%x00%b%x1e`, {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (!raw.trim()) return [];
    return raw
      .split('\x1e')
      .filter(Boolean)
      .map((entry) => {
        const [sha, subject, body] = entry.split('\x00');
        return {
          sha: (sha ?? '').trim(),
          subject: (subject ?? '').trim(),
          body: (body ?? '').trim(),
        };
      });
  } catch {
    return []; // branch may not have a merge-base with main
  }
}

// ── Step 2: classify each ref ───────────────────────────────────────────────

const taskCache = new Map();

function classifyTaskId(id) {
  if (taskCache.has(id)) return taskCache.get(id);
  if (!id.startsWith('t_')) {
    taskCache.set(id, 'legacy');
    return 'legacy';
  }
  if (!existsSync(KANBAN_DB)) {
    taskCache.set(id, 'unknown');
    return 'unknown';
  }
  try {
    const py = `
import json, sqlite3
db = sqlite3.connect('${KANBAN_DB}')
row = db.execute("SELECT status FROM tasks WHERE id = ?", ('${id}',)).fetchone()
if row is None: print('unknown')
elif row[0] == 'archived': print('archived')
else: print('open')
`;
    const out = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    taskCache.set(id, out || 'unknown');
    return out || 'unknown';
  } catch {
    taskCache.set(id, 'unknown');
    return 'unknown';
  }
}

// ── Step 3: per-branch analysis ─────────────────────────────────────────────

function analyzeBranch(branch) {
  const commits = commitsAheadOfMain(branch);
  if (commits.length === 0) {
    return { branch, status: 'no-commits-ahead', commits: [] };
  }

  const enriched = commits.map((c) => {
    const fullMsg = `${c.subject}\n\n${c.body}`;
    const refs = [...fullMsg.matchAll(REF_RE_GLOBAL)].map((m) => m[1]);
    const refStatuses = refs.map((r) => ({ id: r, status: classifyTaskId(r) }));
    // Tracked = ref points at any task that existed and ran through its
    // lifecycle. 'archived' counts as tracked (work shipped, normal close);
    // only 'unknown' (typo / never-existed) is untracked.
    const hasTrackedRef = refStatuses.some(
      (r) => r.status === 'open' || r.status === 'legacy' || r.status === 'archived',
    );
    return { ...c, refs: refStatuses, tracked: hasTrackedRef };
  });

  const trackedCount = enriched.filter((c) => c.tracked).length;
  let status;
  if (trackedCount === enriched.length) status = 'tracked';
  else if (trackedCount === 0) status = 'orphan';
  else status = 'partial';

  return {
    branch,
    status,
    commits: enriched,
    summary: {
      total: enriched.length,
      tracked: trackedCount,
      orphan: enriched.length - trackedCount,
    },
  };
}

// ── Step 4: assemble report ─────────────────────────────────────────────────

const branches = listBranchesAheadOfMain();
const analyses = branches.map(analyzeBranch);

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    branches: analyses.length,
    tracked: analyses.filter((a) => a.status === 'tracked').length,
    partial: analyses.filter((a) => a.status === 'partial').length,
    orphan: analyses.filter((a) => a.status === 'orphan').length,
    noCommitsAhead: analyses.filter((a) => a.status === 'no-commits-ahead').length,
  },
  branches: analyses,
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

// ── Step 5: emit human summary ──────────────────────────────────────────────

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

console.log(`Orphan-WIP audit · ${report.generatedAt}`);
console.log(`Wrote ${REPORT_PATH}`);
console.log('');
console.log(`Branches scanned: ${report.totals.branches}`);
console.log(
  `  ${GREEN}tracked${RESET}        ${report.totals.tracked}  (every commit refs an open task)`,
);
console.log(
  `  ${YELLOW}partial${RESET}        ${report.totals.partial}  (some commits ref'd, some not)`,
);
console.log(`  ${YELLOW}orphan${RESET}         ${report.totals.orphan}  (no commits ref any task)`);
console.log(
  `  ${DIM}no-ahead${RESET}       ${report.totals.noCommitsAhead}  (branch has no commits ahead of main)`,
);
console.log('');

if (report.totals.orphan > 0 || report.totals.partial > 0 || VERBOSE) {
  for (const a of analyses) {
    if (a.status === 'no-commits-ahead' && !VERBOSE) continue;
    if (a.status === 'tracked' && !VERBOSE) continue;
    const tone = a.status === 'orphan' ? YELLOW : a.status === 'partial' ? YELLOW : DIM;
    console.log(`${tone}${a.status.padEnd(8)}${RESET} ${a.branch}`);
    if (a.commits.length === 0) continue;
    for (const c of a.commits) {
      const refLabel =
        c.refs.length === 0
          ? `${YELLOW}no-ref${RESET}`
          : c.refs.map((r) => `${r.id} (${r.status})`).join(', ');
      console.log(`  ${c.sha.slice(0, 8)}  ${c.subject.slice(0, 60)}`);
      console.log(`    ${DIM}refs:${RESET} ${refLabel}`);
    }
  }
}

process.exit(0);
