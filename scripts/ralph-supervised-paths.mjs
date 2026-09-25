#!/usr/bin/env node
/**
 * scripts/ralph-supervised-paths.mjs
 *
 * Publishes the ops#238 supervised-path set as one line per path, so the
 * engine's bash (hirobius/ralph#25) can read the SAME definition this repo's
 * JS watchdog enforces, without hand-copying prefixes into a workflow.
 *
 * WHY a manifest, not a PR-fetching CLI: the engine job already has the full
 * diff locally (checkout with `fetch-depth: 0`; the drift step already runs
 * `git diff --name-only origin/$base...HEAD`), so there is no API paging and
 * no 3000-file cap to fail closed around here — this script only needs to say
 * WHAT counts as supervised, not fetch a diff itself.
 *
 * Restates no path literal of its own: it imports REVENUE_PATH_PREFIXES from
 * metric-north-star-share.mjs and BOUNDARY_SELF_PATHS from ralph-watchdog.mjs
 * — the same two lists scripts/audit-ralph-merge-boundary.mjs (#398) and the
 * watchdog's own merge path already use — and prints their union, one path
 * prefix per line, on stdout. No network, no flags: the caller diffs its
 * already-known changed-file list against these prefixes itself.
 *
 * Usage:
 *   node scripts/ralph-supervised-paths.mjs      # one path prefix per line
 *   pnpm ralph:supervised-paths
 *
 * @module ralph-supervised-paths
 */

import { REVENUE_PATH_PREFIXES } from './metric-north-star-share.mjs';
import { BOUNDARY_SELF_PATHS } from './ralph-watchdog.mjs';

/** The published set: revenue path + the boundary's own files. One list, printed. */
export const SUPERVISED_PATHS = [...REVENUE_PATH_PREFIXES, ...BOUNDARY_SELF_PATHS];

function main() {
  process.stdout.write(SUPERVISED_PATHS.map((p) => `${p}\n`).join(''));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
