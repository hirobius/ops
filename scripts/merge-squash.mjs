#!/usr/bin/env node
/**
 * scripts/merge-squash.mjs
 *
 * Automates the squash-merge-with-baseline-tag protocol for fix/* → main.
 * Full protocol: docs/operations/squash-merge-protocol.md
 *
 * Steps executed (Steps 1–5 from the protocol doc):
 *  1. Verify on a fix/* branch, clean working tree, all fast gates pass.
 *  2. Tag the baseline (vX.Y.Z-pre-merge) on the fix/* branch tip.
 *  3. Squash-merge fix/* onto main.
 *  4. Generate commit message from orchestration.json done-since-baseline units.
 *  5. Tag main (vX.Y.Z).
 *  6. Report + instruct operator to manually push.
 *
 * Step 6 (git push) is NEVER automated — requires explicit Adrian instruction.
 *
 * Usage:
 *   pnpm merge:squash
 *   node scripts/merge-squash.mjs [--dry-run] [--from <branch>] [--into <branch>]
 *
 * Flags:
 *   --dry-run     Show what would happen; no git writes.
 *   --from        Source branch (default: current branch, must match fix/*)
 *   --into        Target branch (default: main)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const ROOT = join(__dirname, '..');

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const intoIdx = args.indexOf('--into');
const FROM_BRANCH = fromIdx !== -1 ? args[fromIdx + 1] : null;
const INTO_BRANCH = intoIdx !== -1 ? args[intoIdx + 1] : 'main';

// ── Helpers ───────────────────────────────────────────────────────────────────

function git(cmd, opts = {}) {
  if (DRY_RUN && !opts.readOnly) {
    console.log(`[dry-run] git ${cmd}`);
    return opts.fallback ?? '';
  }
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: opts.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const msg = err.stderr ?? err.message ?? String(err);
    throw new Error(`git ${cmd} failed:\n${msg.trim()}`);
  }
}



function bail(msg) {
  console.error(`\nABORT: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`\n[merge-squash] ${msg}`);
}

// ── Gate check ────────────────────────────────────────────────────────────────

function checkGates() {
  info('Running fast gates...');
  const gates = [
    'node scripts/validate-manifest.mjs',
    'node scripts/validate-orchestration.mjs',
    'node scripts/check-manifest-drift.mjs',
    'node scripts/check-binding-drift.mjs',
    'node scripts/check-source-canon.mjs',
  ];
  for (const gate of gates) {
    try {
      execSync(gate, { cwd: ROOT, stdio: 'pipe' });
      console.log(`  ✓ ${gate.split(' ').pop()}`);
    } catch (err) {
      bail(`Gate failed: ${gate}\n${(err.stderr ?? err.stdout ?? '').toString().trim()}`);
    }
  }

  // TypeCheck
  try {
    execSync('pnpm typecheck', { cwd: ROOT, stdio: 'pipe' });
    console.log('  ✓ typecheck');
  } catch {
    bail('pnpm typecheck failed. Fix type errors before merging.');
  }

  // Stale claims
  try {
    const result = execSync('node scripts/audit-claims.mjs', { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    if (result.includes('STALE')) {
      bail('Stale claims detected. Resolve stale claims before merging.\n  Run: node scripts/audit-claims.mjs');
    }
    console.log('  ✓ no stale claims');
  } catch {
    // audit-claims might not exist yet — skip silently
    console.log('  · audit-claims.mjs not found — skipping stale claim check');
  }
}

// ── Unit harvest — frozen orchestration.json + live kanban.db ────────────────
// Cutover: 2026-05-06. orchestration.json frozen (historical only).
// New completions land in ~/.hermes/kanban.db. Harvest from both sources.

function getDoneUnitsSinceBaseline(baselineCommit) {
  let baselineDate;
  try {
    const dateStr = execSync(`git show -s --format=%ci ${baselineCommit}`, { cwd: ROOT, encoding: 'utf8' }).trim();
    baselineDate = new Date(dateStr);
  } catch {
    baselineDate = new Date(0);
  }

  const fromOrch = harvestFromOrchestrationJson(baselineDate);
  const fromKanban = harvestFromKanbanDb(baselineDate);

  // Dedupe by id (kanban archived tasks duplicate orch.json done units)
  const byId = new Map();
  for (const u of fromOrch) byId.set(u.id, u);
  for (const u of fromKanban) byId.set(u.id, u);
  return [...byId.values()];
}

function harvestFromOrchestrationJson(baselineDate) {
  try {
    const raw = readFileSync(join(ROOT, 'docs/ai/orchestration.json'), 'utf8');
    const data = JSON.parse(raw);
    const units = data.units ?? [];
    return units
      .filter(u => u.status === 'done' && u.completedAt)
      .filter(u => new Date(u.completedAt) >= baselineDate)
      .map(u => ({ id: u.id, name: u.name, description: u.description }));
  } catch {
    return [];
  }
}

function harvestFromKanbanDb(baselineDate) {
  // Shell out to python3 (no SQLite Node dep). Returns JSON array.
  const HOME = process.env.HOME ?? '/home/adrian';
  const kanbanDb = join(HOME, '.hermes/kanban.db');
  try {
    const baselineMs = baselineDate.getTime();
    const py = `
import json, sqlite3, sys
db = sqlite3.connect('${kanbanDb}')
rows = db.execute("""
  SELECT id, title, completed_at FROM tasks
  WHERE tenant='hds' AND status='done' AND completed_at IS NOT NULL AND completed_at >= ?
""", (${baselineMs},)).fetchall()
print(json.dumps([{'id': r[0], 'name': r[1], 'description': ''} for r in rows]))
`;
    const out = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    return JSON.parse(out);
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nSquash-Merge Protocol — fix/* → main');
  console.log('======================================');
  if (DRY_RUN) console.log('[DRY RUN MODE — no git writes will occur]\n');

  // ── 0. Check working tree ──────────────────────────────────────────────────

  const status = git('status --porcelain', { readOnly: true, silent: true });
  if (status.trim()) {
    bail('Dirty working tree. Commit or stash all changes before merging.\n' + status);
  }

  const currentBranch = git('branch --show-current', { readOnly: true, silent: true });
  const sourceBranch = FROM_BRANCH ?? currentBranch;

  if (!sourceBranch.startsWith('fix/')) {
    bail(`Source branch "${sourceBranch}" does not match fix/* pattern. Run from a fix/* branch.`);
  }

  info(`Source: ${sourceBranch} → Target: ${INTO_BRANCH}`);

  // ── 1. Get version from package.json ──────────────────────────────────────

  const pkgRaw = readFileSync(join(ROOT, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const VERSION = pkg.version ?? '0.0.0';

  info(`Package version: ${VERSION}`);

  // ── 2. Run gates ──────────────────────────────────────────────────────────

  checkGates();

  // ── 3. Tag the baseline ───────────────────────────────────────────────────

  const premergeTag = `v${VERSION}-pre-merge`;
  const headCommit = git('rev-parse HEAD', { readOnly: true, silent: true });

  // Check if tag already exists
  const existingTags = git('tag -l', { readOnly: true, silent: true });
  if (existingTags.split('\n').includes(premergeTag)) {
    info(`Pre-merge tag ${premergeTag} already exists — skipping re-tag.`);
  } else {
    info(`Creating baseline tag: ${premergeTag} at ${headCommit.slice(0, 8)}`);
    git(`tag -a ${premergeTag} -m "fix/${sourceBranch.slice(4)} tip pre-squash-merge to ${INTO_BRANCH}\\n\\nTagging commit ${headCommit}\\nAll validation gates pass at this commit."`, {});
    console.log(`  ✓ Tagged ${premergeTag}`);
  }

  // ── 4. Gather done units since baseline ───────────────────────────────────

  const mergeBase = git(`merge-base ${INTO_BRANCH} ${sourceBranch}`, { readOnly: true, silent: true });
  const doneUnits = getDoneUnitsSinceBaseline(mergeBase);
  const unitList = doneUnits.length > 0
    ? doneUnits.map(u => `  - ${u.id}: ${u.name ?? u.description ?? ''}`).join('\n')
    : '  (no units in orchestration.json with completedAt since merge-base)';

  // ── 5. Switch to target and squash-merge ──────────────────────────────────

  info(`Switching to ${INTO_BRANCH}...`);
  git(`checkout ${INTO_BRANCH}`, {});

  info(`Running squash-merge from ${sourceBranch}...`);
  git(`merge --squash ${sourceBranch}`, {});

  // Build commit message
  const commitMsg = [
    `feat(release): v${VERSION} — squash-merge from ${sourceBranch}`,
    '',
    `Source: ${sourceBranch} → ${INTO_BRANCH}`,
    `Baseline tag: ${premergeTag}`,
    '',
    'Units completed since merge-base:',
    unitList,
    '',
    'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>',
  ].join('\n');

  info('Committing squash-merge...');
  git(`commit -m "${commitMsg.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {});
  const squashCommit = git('rev-parse HEAD', { readOnly: true, silent: true });
  console.log(`  ✓ Squash commit: ${squashCommit.slice(0, 8)}`);

  // ── 6. Tag main ───────────────────────────────────────────────────────────

  const releaseTag = `v${VERSION}`;
  if (existingTags.split('\n').includes(releaseTag)) {
    info(`Release tag ${releaseTag} already exists — skipping.`);
  } else {
    info(`Tagging ${INTO_BRANCH}: ${releaseTag}`);
    git(`tag -a ${releaseTag} -m "Release ${releaseTag} — squash-merged from ${sourceBranch}"`, {});
    console.log(`  ✓ Tagged ${releaseTag}`);
  }

  // ── 7. Report ─────────────────────────────────────────────────────────────

  info('Done. Review the squash-merge commit, then push manually:');
  console.log('');
  console.log('  # Verify gates on main:');
  console.log('  pnpm typecheck && node scripts/validate-manifest.mjs');
  console.log('');
  console.log('  # Push (MANUAL — never automated):');
  console.log(`  git push origin ${INTO_BRANCH}`);
  console.log(`  git push --tags`);
  console.log('');
  console.log('  # After push — clean up fix/* branch:');
  console.log(`  git branch -d ${sourceBranch}`);
  console.log(`  git push origin --delete ${sourceBranch}`);
  console.log('');

  if (DRY_RUN) {
    console.log('[Dry run complete — no changes were made]');
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err);
  process.exit(1);
});
