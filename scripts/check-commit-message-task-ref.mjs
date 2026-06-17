#!/usr/bin/env node
/** @internal — guardrail gate, channel: commit-msg. */
/**
 * scripts/check-commit-message-task-ref.mjs
 *
 * Validates that commits on feature branches reference an open Hermes Kanban
 * task via a `Refs: <task-id>` line in the commit body. Soft-warn by default;
 * promote to error via KANBAN_REF_ENFORCE=error.
 *
 * Skip conditions (silent exit 0):
 *   - Branch in {main, release/*, hotfix/*}
 *   - Message contains [skip-kanban]
 *   - Message starts with "Merge " or "Revert "
 *   - Run with --json (audit mode — emits structured result instead)
 *
 * Accepted task-ID formats (regex (t_[a-z0-9]+|1[0-9][a-z]-[0-9]+)):
 *   - t_<8-hex>                  Hermes Kanban (forward-going)
 *   - 1[0-9][a-z]-<n>            Legacy orchestration.json unit IDs
 *
 * Wired from .husky/commit-msg as:
 *   node scripts/check-commit-message-task-ref.mjs "$1"
 *
 * Where $1 is the temp file git provides containing the proposed commit
 * message. The script never writes to that file — it only reads + reports.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const HOME = process.env.HOME ?? '/home/adrian';
const KANBAN_DB = join(HOME, '.hermes/kanban.db');
const ENFORCE = (process.env.KANBAN_REF_ENFORCE ?? 'warn').toLowerCase();

// ── ANSI colours (no chalk dep) ──────────────────────────────────────────────
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

function warn(msg) {
  process.stderr.write(`${YELLOW}⚠  kanban-ref: ${msg}${RESET}\n`);
}

function info(msg) {
  process.stderr.write(`${DIM}   ${msg}${RESET}\n`);
}

// ── Argument parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const positional = args.filter((a) => !a.startsWith('--'));
const messagePath = positional[0];

if (!messagePath) {
  // No path given → audit mode. Read from stdin.
  // Used by fixture meta-tests; not the commit-msg hook path.
  if (jsonMode) {
    emitJson({ ok: true, skipped: true, reason: 'no-message-path-supplied' });
    process.exit(0);
  }
  warn('no commit-message path given (expected as argv[1])');
  process.exit(0);
}

if (!existsSync(messagePath)) {
  if (jsonMode) {
    emitJson({ ok: false, reason: 'message-file-missing', path: messagePath });
    process.exit(0);
  }
  warn(`commit-message file not found: ${messagePath}`);
  process.exit(0);
}

const message = readFileSync(messagePath, 'utf8');

// ── Skip detection ───────────────────────────────────────────────────────────
const skipReason = detectSkip(message);
if (skipReason) {
  if (jsonMode) emitJson({ ok: true, skipped: true, reason: skipReason });
  process.exit(0);
}

// ── Ref extraction ───────────────────────────────────────────────────────────
const REF_RE = /^Refs:\s*(t_[a-z0-9]+|1[0-9][a-z]-[0-9]+)\s*$/im;
const match = message.match(REF_RE);

if (!match) {
  finishMissingRef();
}

const taskId = match[1];

// ── Lookup against kanban.db ─────────────────────────────────────────────────
const lookup = lookupTask(taskId);

if (lookup === 'unknown' && taskId.startsWith('t_')) {
  // Hermes-prefixed ref but not in kanban.db — likely typo or stale ref
  finishStaleRef(taskId, 'unknown');
}

if (lookup === 'archived' && taskId.startsWith('t_')) {
  finishStaleRef(taskId, 'archived');
}

// Legacy IDs (`13y-9`) won't appear in kanban.db — those refer to the frozen
// orchestration.json. Accept silently if the format matches.
if (jsonMode) emitJson({ ok: true, taskId, status: lookup });
process.exit(0);

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectSkip(msg) {
  if (/\[skip-kanban\]/i.test(msg)) return 'skip-kanban-tag';
  if (/^Merge /m.test(msg) || /^Revert /m.test(msg)) return 'merge-or-revert';

  const branch = currentBranch();
  if (branch === 'main' || /^release\//.test(branch) || /^hotfix\//.test(branch)) {
    return `protected-branch:${branch}`;
  }
  return null;
}

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function lookupTask(id) {
  // Returns: 'open' | 'archived' | 'unknown'
  // Legacy 1Xy-N ids: kanban.db won't have them (they're in frozen orch.json)
  if (!id.startsWith('t_')) return 'legacy';
  if (!existsSync(KANBAN_DB)) return 'unknown';
  try {
    const py = `
import json, sqlite3, sys
db = sqlite3.connect('${KANBAN_DB}')
row = db.execute("SELECT status FROM tasks WHERE id = ?", ('${id}',)).fetchone()
if row is None: print('unknown')
elif row[0] == 'archived': print('archived')
else: print('open')
`;
    const out = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

function finishMissingRef() {
  if (jsonMode) {
    emitJson({ ok: ENFORCE !== 'error', reason: 'missing-ref' });
    process.exit(ENFORCE === 'error' ? 1 : 0);
  }
  warn('commit body has no `Refs:` line — work intent is not linked to a kanban task.');
  info('Add a line like:   Refs: t_38b7574e   (or:   Refs: 13y-9   for legacy unit IDs)');
  info('Skip with [skip-kanban] in the message, or work on main/release/*/hotfix/* branches.');
  info(`See docs: claude-config/skills/dispatch-unit/SKILL.md (commit-msg convention)`);
  if (ENFORCE === 'error') {
    info('Mode: error (KANBAN_REF_ENFORCE=error). Commit blocked.');
    process.exit(1);
  }
  info('Mode: warn (default). Commit will succeed; promote with KANBAN_REF_ENFORCE=error.');
  process.exit(0);
}

function finishStaleRef(id, kind) {
  if (jsonMode) {
    emitJson({ ok: ENFORCE !== 'error', reason: `stale-ref-${kind}`, taskId: id });
    process.exit(ENFORCE === 'error' ? 1 : 0);
  }
  warn(`Refs: ${id} points at ${kind === 'archived' ? 'an archived task' : 'a task that is not in kanban.db'}.`);
  info(`Verify with:  hermes kanban show ${id}`);
  info('If the ref is wrong, amend the commit message; if intentional, add [skip-kanban].');
  if (ENFORCE === 'error') {
    process.exit(1);
  }
  process.exit(0);
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}
