#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-editorconfig.mjs
 *
 * Graceful-degradation guard around `editorconfig-checker`. The npm
 * package downloads a per-platform Go binary on first run; that download
 * 403s in network-constrained sessions (remote/web sandboxes, egress-
 * blocked runners). Without this guard, one unreachable binary hard-fails
 * check:fast/check:full/check:mojibake outright — voiding every other
 * gate in the same chain, the same failure mode `.husky/pre-commit`
 * already avoids for gitleaks (`command -v gitleaks || echo "skipping"`).
 *
 * This mirrors that pattern: probe by actually running the tool, skip
 * with a named warning ONLY when its own binary-download step is what
 * failed, and forward every other outcome (clean pass, real violations,
 * unrelated tool errors) untouched. CI (ci.yml runs check:full) has real
 * egress, so it always gets the hard version.
 *
 * Swapped in for the raw `pnpm exec editorconfig-checker` invocation in
 * check:fast / check:full / check:mojibake (package.json).
 *
 * Test overrides (used by scripts/__tests__/check-editorconfig.test.mjs
 * to simulate clean/violating/binary-unavailable without touching the
 * real network-dependent binary):
 *   CHECK_EDITORCONFIG_BIN   command to run (default: "pnpm")
 *   CHECK_EDITORCONFIG_ARGS  space-separated args (default: "exec editorconfig-checker")
 *   CHECK_EDITORCONFIG_TIMEOUT_MS  kill + treat as unavailable after this long (default: 30000)
 *
 * Usage: node scripts/check-editorconfig.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const UNAVAILABLE_MARKER = 'Failed to download binary';

export function isBinaryUnavailable(output) {
  return typeof output === 'string' && output.includes(UNAVAILABLE_MARKER);
}

function main() {
  const bin = process.env.CHECK_EDITORCONFIG_BIN || 'pnpm';
  const args = (process.env.CHECK_EDITORCONFIG_ARGS || 'exec editorconfig-checker')
    .split(' ')
    .filter(Boolean);
  const timeout = Number(process.env.CHECK_EDITORCONFIG_TIMEOUT_MS) || 30_000;

  const result = spawnSync(bin, args, { encoding: 'utf8', timeout });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';

  if (timedOut || (result.status !== 0 && isBinaryUnavailable(output))) {
    console.warn(
      '⚠ check-editorconfig: editorconfig-checker binary unavailable in this session ' +
        '(its platform binary download failed or timed out — likely network-restricted) ' +
        '— skipping. Run it in CI or a session with egress for full coverage.',
    );
    return 0;
  }

  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
