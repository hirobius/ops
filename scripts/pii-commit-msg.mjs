#!/usr/bin/env node
/**
 * scripts/pii-commit-msg.mjs — the commit-msg entry point of the PII gate.
 *
 *   node scripts/pii-commit-msg.mjs <commit-message-file>   (.husky/commit-msg)
 *
 * Pre-commit sees only staged content, so without this a commit message naming
 * a client passed every local hook and was first caught after the push, in
 * public (ops#27). Runs `scripts/check-pii.mjs --message-file <file>` and exits
 * with its code.
 *
 * Why a separate entry point: check-validator-wiring maps a gate script named
 * in .husky/commit-msg to the commit-msg channel, and check-pii is registered
 * on pre-commit (docs/guardrails/registry.json).
 *
 * @module pii-commit-msg
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: node scripts/pii-commit-msg.mjs <commit-message-file>\n');
  process.exit(2);
}

const gate = join(dirname(fileURLToPath(import.meta.url)), 'check-pii.mjs');
const result = spawnSync(process.execPath, [gate, '--message-file', file], { stdio: 'inherit' });
process.exit(result.status ?? 1);
