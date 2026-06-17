#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Activates Husky as the repo's hook path.
 * Runs automatically on `pnpm install` via the "prepare" script.
 *
 * Hook tier:
 *   pre-commit → pnpm typecheck
 *   pre-push   → pnpm check:full + test:a11y + heal + visual parity ingest
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import installHusky from 'husky';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = join(ROOT, '.git');

if (!existsSync(HOOKS_DIR)) {
  // Not a git repo (e.g. CI artifact unzip) — skip silently.
  process.exit(0);
}

try {
  process.chdir(ROOT);
  const result = installHusky('.husky');
  if (result) {
    throw new Error(String(result));
  }
  console.log('✓ git hooks activated (.husky/)');
} catch (err) {
  console.error('✗ Failed to initialize Husky:', err.message);
  process.exit(1);
}
