/**
 * scripts/lib/resolve-playwright-browser.mjs
 *
 * Resolve a pre-installed Chromium executable for Playwright in the remote
 * execution sandbox.
 *
 * The sandbox ships Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default
 * `/opt/pw-browsers`) behind a maintained, version-stable `chromium` symlink.
 * Playwright's default resolution instead looks for a specific build-numbered
 * path (`chromium_headless_shell-<build>`) that drifts from the installed
 * build — so without this, every session hand-symlinks binaries into the path
 * Playwright expects just to make the visual/layout suites run (see BS1a).
 * Passing `executablePath` = the stable symlink sidesteps the build-number
 * drift entirely; Playwright launches exactly that binary.
 *
 * Returns the executable path when a pre-installed browser is present, or
 * `undefined` so Playwright falls back to its normal resolution — CI and local
 * dev, where Playwright manages its own browsers at the expected versioned
 * path, are left completely untouched.
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]        defaults to process.env
 * @param {(p: string) => boolean} [opts.exists] existence probe; defaults to fs.existsSync
 * @returns {string | undefined}
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveChromiumExecutable({ env = process.env, exists = existsSync } = {}) {
  // Operator escape hatch — an explicit path always wins when it exists.
  const explicit = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit && exists(explicit)) return explicit;

  // The sandbox's maintained, version-stable symlink (prefer the env-declared
  // browsers path, fall back to the documented default location).
  const candidates = [];
  if (env.PLAYWRIGHT_BROWSERS_PATH) {
    candidates.push(join(env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'));
  }
  candidates.push('/opt/pw-browsers/chromium');

  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return undefined;
}
