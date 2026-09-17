#!/usr/bin/env node
/**
 * check-branch-ancestry.mjs — warn when the current branch is no longer based
 * on `origin/main`.
 *
 * WHY (ops#335). This repo squash-merges. A squash replays the branch as one
 * new commit on main, so the instant a PR lands the source branch is unrelated
 * to main in BOTH directions. Committing on it builds a fork, and the PR that
 * follows carries phantom diffs reverting everything that landed in between —
 * a near-miss on 2026-09-16 would have shown #326's lib/outreach/guard.mjs,
 * export-call-list.mjs, log-call.mjs and migrations 0013/0014 as deletions.
 *
 * The stop hook actively misleads here: it reads the orphaned pointer as
 * "N unpushed commits" and advises pushing, which is the one wrong move.
 *
 * NEVER BLOCKS. When this gate was written, run-gates.mjs failed the whole
 * pre-commit run on any non-zero exit regardless of the registry `severity`
 * field — the ops#304 incident, where a warn-severity finding bricked every
 * commit in the repo. ops#306 made run-gates honour severity (a failing `warn`
 * gate now reports without blocking), but this gate still exits 0 in the normal
 * path, always, and only prints — so it stays harmless when invoked directly.
 *
 * The one exception is `--fixture-mode`, where validate-fixture-proof-of-firing
 * runs the gate against fixtures/check-branch-ancestry/violating.example.json
 * and REQUIRES a non-zero exit as proof the rule can actually fire. Real
 * fixture, not a stub.
 *
 * DOES NOT FETCH. It reads the locally-known origin/main. A hook that hits the
 * network is slow and breaks offline, so the comparison can be stale and every
 * message says so.
 *
 * Usage:
 *   node scripts/check-branch-ancestry.mjs
 *   node scripts/check-branch-ancestry.mjs --json
 *   node scripts/check-branch-ancestry.mjs --fixture-mode   # FIXTURE_FILE=<path>
 *
 * @module check-branch-ancestry
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateBranch, OK, SKIP } from '../lib/ops/branch-ancestry.mjs';

const argv = process.argv.slice(2);
const jsonMode = argv.includes('--json');
const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const MAIN_REF = 'refs/remotes/origin/main';

/** Run a git command, returning trimmed stdout, or null if it fails. */
function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** `git merge-base --is-ancestor a b` as a boolean; null when git cannot answer. */
function isAncestor(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' });
    return true;
  } catch (err) {
    // Exit 1 is a clean "no". Anything else (bad ref, not a repo) is unknown.
    return err.status === 1 ? false : null;
  }
}

/** Collect the git facts evaluateBranch needs. */
function readRepoState() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const detached = branch === 'HEAD' || branch === null;
  const mainRefKnown = git(['rev-parse', '--verify', '--quiet', MAIN_REF]) !== null;

  if (detached || !mainRefKnown || branch === 'main') {
    return { branch, detached, mainRefKnown };
  }

  const mainIsAncestorOfHead = isAncestor('origin/main', 'HEAD');
  const headIsAncestorOfMain = isAncestor('HEAD', 'origin/main');

  // If git could not answer either question, say we do not know rather than
  // inventing a verdict — an unknown must skip, not fire.
  if (mainIsAncestorOfHead === null || headIsAncestorOfMain === null) {
    return { branch, detached, mainRefKnown: false };
  }

  return { branch, detached, mainRefKnown, mainIsAncestorOfHead, headIsAncestorOfMain };
}

/** In fixture mode the state comes from a JSON file, not from git. */
function readFixtureState() {
  if (!fixtureFile) {
    process.stderr.write('check-branch-ancestry: --fixture-mode requires FIXTURE_FILE\n');
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(fixtureFile, 'utf8'));
  } catch (err) {
    process.stderr.write(`check-branch-ancestry: cannot read fixture: ${err.message}\n`);
    process.exit(2);
  }
}

const state = fixtureMode ? readFixtureState() : readRepoState();
const result = evaluateBranch(state);
const firing = result.status !== OK && result.status !== SKIP;

if (jsonMode) {
  const violations = firing
    ? [
        {
          file: '.git/HEAD',
          rule: `branch-${result.status}`,
          severity: result.severity,
          message: result.message,
        },
      ]
    : [];
  process.stdout.write(JSON.stringify({ violations }, null, 2) + '\n');
} else if (firing) {
  process.stdout.write(`⚠ check-branch-ancestry — ${result.status}\n\n${result.message}\n\n`);
  process.stdout.write('  (warning only — this gate never blocks a commit)\n');
} else {
  process.stdout.write(`✓ check-branch-ancestry — ${result.message}\n`);
}

// Fixture mode must signal firing so proof-of-firing can verify the rule works.
// Every other path exits 0: see the ops#304 note above.
process.exit(fixtureMode && firing ? 1 : 0);
