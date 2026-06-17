#!/usr/bin/env node
/** @internal — convenience helper, not a guardrail. */
/**
 * scripts/kanban-start.mjs
 *
 * Single-command "I'm starting work" helper. Combines:
 *   - hermes kanban create <title> --triage --workspace worktree
 *   - git worktree add .worktrees/<short-id> -b feat/<short-id>-<slug>
 *   - writes HERMES_TASK_ID into the worktree's .git metadata for reverse
 *     lookup ("which task owns this worktree?")
 *
 * Echoes a copy-paste block with the branch, workspace path, and the
 * `Refs: t_<id>` line you paste into commit bodies on that branch so
 * the commit-msg hook (Phase 1) doesn't warn.
 *
 * Usage:
 *   pnpm kanban:start "<title>"
 *   pnpm kanban:start "<title>" --client lilac-insure --effort standard
 *   pnpm kanban:start "<title>" --no-worktree   (just create the task)
 *
 * Example:
 *   pnpm kanban:start "rewire DispatchTable to use TanStack" --effort standard
 *   → creates t_a1b2c3d4
 *   → creates .worktrees/a1b2c3d4 on branch feat/a1b2c3d4-rewire-dispatch...
 *   → echoes "Refs: t_a1b2c3d4" for paste into commit body
 *
 * Hard-rule reminders (from CLAUDE.md §0):
 *   - Never push.
 *   - Never touch .env*.
 *   - Local commits only.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

// ── Argument parsing ────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = {
  client: null,
  effort: null,
  noWorktree: false,
};
const positional = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--no-worktree') { flags.noWorktree = true; continue; }
  if (a === '--client') { flags.client = argv[++i]; continue; }
  if (a === '--effort') { flags.effort = argv[++i]; continue; }
  if (a === '--help' || a === '-h') { printHelpAndExit(); }
  if (a.startsWith('--')) { fail(`Unknown flag: ${a}`); }
  positional.push(a);
}

if (positional.length === 0) {
  fail('Title is required.\n\nUsage:\n  pnpm kanban:start "<title>" [--client <slug>] [--effort min|standard|high] [--no-worktree]');
}

const title = positional.join(' ').trim();

if (!title) {
  fail('Title cannot be empty.');
}

if (flags.effort && !['min', 'standard', 'high'].includes(flags.effort)) {
  fail(`--effort must be one of: min, standard, high (got: ${flags.effort})`);
}

// ── Step 1: create the kanban task ──────────────────────────────────────────

const bodyLines = [];
bodyLines.push('Created via `pnpm kanban:start`.');
if (flags.client) bodyLines.push(`Client: ${flags.client}`);
if (flags.effort) bodyLines.push(`Effort: ${flags.effort}`);
bodyLines.push('');
bodyLines.push('Reference this task in commit bodies via:');
bodyLines.push('  Refs: <task-id>');
const body = bodyLines.join('\n');

let createOut;
try {
  // --triage parks it in triage status (not ready) so the dispatcher doesn't
  // try to spawn a worker for it. Adrian's working it himself.
  createOut = execSync(
    `hermes kanban create ${shellQuote(title)} --triage --workspace worktree --created-by adrian --body ${shellQuote(body)}`,
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
} catch (err) {
  fail(`hermes kanban create failed:\n${err.stderr ?? err.message}`);
}

// `hermes kanban create` outputs a line like: "Created t_a1b2c3d4  (triage, assignee=-)"
const taskIdMatch = createOut.match(/Created\s+(t_[a-z0-9]+)/);
if (!taskIdMatch) {
  fail(`Could not parse task ID from kanban create output:\n${createOut}`);
}
const taskId = taskIdMatch[1];
const shortId = taskId.replace(/^t_/, '');

console.log(`✓ created task ${taskId}`);

// ── Step 2: create the worktree (unless --no-worktree) ──────────────────────

let worktreePath = null;
let branchName = null;

if (!flags.noWorktree) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  branchName = `feat/${shortId}-${slug}`;
  worktreePath = join(ROOT, '.worktrees', shortId);

  // Make sure .worktrees/ exists
  mkdirSync(join(ROOT, '.worktrees'), { recursive: true });

  // Verify nothing already there
  if (existsSync(worktreePath)) {
    fail(`Worktree path already exists: ${worktreePath}\nNot overwriting. Pick a new title or remove the existing dir.`);
  }

  try {
    execSync(`git worktree add ${shellQuote(worktreePath)} -b ${shellQuote(branchName)}`, {
      cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
    });
  } catch (err) {
    fail(`git worktree add failed:\n${err.stderr ?? err.message}\nTask ${taskId} was created — archive with: hermes kanban archive ${taskId}`);
  }

  console.log(`✓ created worktree ${worktreePath} on branch ${branchName}`);

  // Write HERMES_TASK_ID to the worktree's .git metadata for reverse lookup.
  // git worktree creates .git/worktrees/<name>/ as the per-worktree state dir.
  const gitMetaDir = join(ROOT, '.git/worktrees', shortId);
  if (existsSync(gitMetaDir)) {
    writeFileSync(join(gitMetaDir, 'HERMES_TASK_ID'), `${taskId}\n`);
    console.log(`✓ wrote HERMES_TASK_ID → ${join(gitMetaDir, 'HERMES_TASK_ID')}`);
  }
}

// ── Step 3: echo the copy-paste block ───────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

console.log('');
console.log(`${BOLD}Ready to start.${RESET}`);
console.log('');
if (worktreePath) {
  console.log(`  cd ${worktreePath}`);
}
console.log('');
console.log(`${DIM}Paste this line in commit bodies on this branch:${RESET}`);
console.log(`  ${CYAN}Refs: ${taskId}${RESET}`);
console.log('');
console.log(`${DIM}When done:${RESET}`);
console.log(`  ${DIM}hermes kanban complete ${taskId} --summary "<one-liner>" --metadata '{"commitShas":["..."]}'${RESET}`);
if (worktreePath) {
  console.log(`  ${DIM}git worktree remove ${worktreePath}${RESET}`);
}
console.log('');

process.exit(0);

// ── Helpers ─────────────────────────────────────────────────────────────────

function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function fail(msg) {
  process.stderr.write(`✖  ${msg}\n`);
  process.exit(1);
}

function printHelpAndExit() {
  process.stdout.write(`pnpm kanban:start <title> [flags]

Creates a Hermes Kanban task in triage + an isolated git worktree, prints
the Refs: line to paste in commits.

Required:
  <title>            Imperative description of the work intent

Flags:
  --client <slug>    Client tag (added to body, not the task primary fields)
  --effort <level>   min | standard | high (added to body)
  --no-worktree      Skip worktree creation (just create the task)
  --help, -h         This message

Output:
  Created task ID, worktree path, branch name, copy-paste 'Refs:' line.

See CLAUDE.md and claude-config/skills/dispatch-unit/SKILL.md for the
broader convention.
`);
  process.exit(0);
}
