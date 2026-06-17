#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/dispatch-pod.mjs
 *
 * Worktree-isolation verification for sub-agent dispatch.
 *
 * Background: the Agent tool's `isolation: "worktree"` flag has been
 * unreliable across sessions — agents have reported "isolated" runs while
 * actually writing to the parent worktree. Pod 1's elevation work leaked
 * into main; Pod 5's worktree was 258 commits behind; in the 2026-05-01
 * Window 1 dispatch, 3 of 5 agents produced empty / cross-pollinated
 * commits because their writes hit the shared main worktree instead of
 * their nominal worktree branch.
 *
 * This script lets a dispatched sub-agent verify, before every commit,
 * that they're genuinely on an isolated worktree. If the check fails, the
 * agent must abort and report back rather than commit broken state.
 *
 * Usage (from inside a dispatched sub-agent's bash session):
 *
 *   node scripts/dispatch-pod.mjs verify
 *     # exit 0 if cwd + git state confirm worktree isolation;
 *     # exit 1 with a diagnostic if isolation did not take.
 *
 *   node scripts/dispatch-pod.mjs verify --base fix/ui-pipeline
 *     # additionally verifies HEAD was branched from the named base ref
 *     # (no divergence from the dispatch baseline).
 *
 *   node scripts/dispatch-pod.mjs status [--json]
 *     # prints a diagnostic of cwd / branch / git dirs without exiting
 *     # non-zero.
 *
 * Embed in every dispatch prompt's universal preamble:
 *
 *   BEFORE EVERY COMMIT (mandatory):
 *     node scripts/dispatch-pod.mjs verify --base fix/ui-pipeline
 *   If that exits non-zero, ABORT — do NOT commit. Report back to the
 *   parent agent so the dispatch can be re-tried or rescued.
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKTREE_BRANCH_RE = /^worktree-agent-[a-f0-9]+$/;
const WORKTREE_PATH_RE = /[\\/]\.claude[\\/]worktrees[\\/]agent-[a-f0-9]+(?:[\\/]|$)/;

export function gitOutput(cmd, cwd = process.cwd()) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Inspect the current shell's worktree state. Returns a structured report
 * with the booleans the verifier uses + a diagnostic list of any issues.
 *
 * Pure relative to the injected `git` callback — pass a stub for tests.
 */
export function inspectIsolation({ cwd = process.cwd(), git = gitOutput } = {}) {
  const result = {
    cwd,
    isWorktreePath: WORKTREE_PATH_RE.test(cwd),
    branch: null,
    isWorktreeBranch: false,
    gitDir: null,
    commonDir: null,
    isLinkedWorktree: null,
    isolated: false,
    diagnostic: [],
  };

  try {
    result.branch = git('git rev-parse --abbrev-ref HEAD', cwd);
    result.gitDir = git('git rev-parse --absolute-git-dir', cwd);
    result.commonDir = git('git rev-parse --path-format=absolute --git-common-dir', cwd);
    result.isWorktreeBranch = WORKTREE_BRANCH_RE.test(result.branch);
    // Linked worktree: gitDir is a per-worktree subdir of commonDir.
    // Main worktree: gitDir === commonDir.
    result.isLinkedWorktree = result.gitDir !== result.commonDir;
  } catch (err) {
    result.diagnostic.push(`git inspection failed: ${err.message}`);
  }

  if (!result.isWorktreePath) {
    result.diagnostic.push(
      `cwd '${cwd}' is not under .claude/worktrees/agent-* — agent is writing to the parent worktree`,
    );
  }
  if (!result.isWorktreeBranch) {
    result.diagnostic.push(
      `current branch '${result.branch}' is not a worktree-agent-* branch — isolation did not take`,
    );
  }
  if (result.isLinkedWorktree === false) {
    result.diagnostic.push(
      `git common-dir matches git-dir — agent is on the main worktree, not a linked one`,
    );
  }

  result.isolated =
    result.isWorktreePath &&
    result.isWorktreeBranch &&
    result.isLinkedWorktree === true;

  return result;
}

/**
 * Verify the agent's HEAD was branched from `baseRef` (no divergence).
 * `merge-base HEAD baseRef === rev-parse baseRef` is the canonical check.
 */
export function verifyBase({ cwd = process.cwd(), baseRef, git = gitOutput }) {
  const out = { baseRef, ok: false, diagnostic: [] };
  try {
    out.baseCommit = git(`git rev-parse ${baseRef}`, cwd);
    out.mergeBase = git(`git merge-base HEAD ${baseRef}`, cwd);
    if (out.mergeBase !== out.baseCommit) {
      out.diagnostic.push(
        `merge-base of HEAD and ${baseRef} is ${out.mergeBase}, but ${baseRef} tip is ${out.baseCommit} — base is stale or HEAD diverged`,
      );
    } else {
      out.ok = true;
    }
  } catch (err) {
    out.diagnostic.push(`base ref '${baseRef}' could not be resolved: ${err.message}`);
  }
  return out;
}

function fmtHuman(report) {
  const lines = [];
  lines.push(`cwd:           ${report.cwd}`);
  if (report.branch) lines.push(`branch:        ${report.branch}`);
  if (report.gitDir) lines.push(`git dir:       ${report.gitDir}`);
  if (report.commonDir) lines.push(`common dir:    ${report.commonDir}`);
  lines.push(`isolated:      ${report.isolated ? 'YES' : 'NO'}`);
  if (report.base) {
    lines.push(`base ${report.base.baseRef}: ${report.base.ok ? 'OK' : 'FAIL'}`);
    if (report.base.baseCommit) lines.push(`  base commit: ${report.base.baseCommit}`);
    if (report.base.mergeBase) lines.push(`  merge base:  ${report.base.mergeBase}`);
  }
  if (report.diagnostic?.length) {
    lines.push('issues:');
    for (const d of report.diagnostic) lines.push(`  - ${d}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const cmd = argv[2];
  const json = argv.includes('--json');
  const baseIdx = argv.indexOf('--base');
  const baseRef = baseIdx > 0 && baseIdx + 1 < argv.length ? argv[baseIdx + 1] : null;
  return { cmd, json, baseRef };
}

export function cli(argv = process.argv) {
  const { cmd, json, baseRef } = parseArgs(argv);

  if (cmd !== 'verify' && cmd !== 'status') {
    console.error('Usage:');
    console.error('  node scripts/dispatch-pod.mjs verify [--base <ref>] [--json]');
    console.error('  node scripts/dispatch-pod.mjs status [--json]');
    return 2;
  }

  const inspection = inspectIsolation();
  let baseCheck = null;
  if (baseRef) {
    baseCheck = verifyBase({ baseRef });
    if (!baseCheck.ok) inspection.diagnostic.push(...baseCheck.diagnostic);
  }
  const report = baseCheck ? { ...inspection, base: baseCheck } : inspection;

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(fmtHuman(report));
  }

  if (cmd === 'verify') {
    const ok = inspection.isolated && (!baseCheck || baseCheck.ok);
    if (!ok) {
      if (!json) {
        console.error('\nFAIL — worktree isolation check did not pass. DO NOT COMMIT.');
        console.error('Abort and report back to the parent agent so the dispatch can be rescued.');
      }
      return 1;
    }
  }
  return 0;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(cli(process.argv));
}
