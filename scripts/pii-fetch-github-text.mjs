#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/pii-fetch-github-text.mjs
 *
 * Writes the issue/PR titles, bodies and comments of a repo that were updated
 * in the last N days to a JSON records file, for
 * `node scripts/check-pii.mjs --records <file>`. Used by
 * .github/workflows/pii-weekly.yml; the logic lives in lib/pii/github-text.mjs.
 *
 * The output file holds raw issue text — write it to $RUNNER_TEMP (or another
 * scratch dir), never into the repo.
 *
 * Not a registry gate (a CI helper, not a scripts/check-* or audit-* validator).
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) node scripts/pii-fetch-github-text.mjs \
 *     --repo hirobius/ops --since-days 8 --out "$TMPDIR/ops-text.json"
 *
 * Exit codes: 0 written · 2 bad arguments, missing token or API error.
 */

import { writeFileSync } from 'node:fs';
import { fetchRecentText } from '../lib/pii/github-text.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const repo = arg('--repo');
  const days = Number(arg('--since-days') ?? '8');
  const out = arg('--out');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !out || !Number.isFinite(days) || days <= 0) {
    throw new Error('usage: --repo owner/name --since-days <n> --out <file.json>');
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set. In Actions add `env: GITHUB_TOKEN: ${{ github.token }}` to this step; locally run with GITHUB_TOKEN=$(gh auth token).',
    );
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const records = await fetchRecentText({ repo, since, token });
  writeFileSync(out, JSON.stringify(records));
  console.log(
    `pii-fetch-github-text: ${records.length} text record(s) from ${repo} updated since ${since}`,
  );
}

main().catch((err) => {
  console.error(`pii-fetch-github-text: ${err.message}`);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::error title=PII weekly scan could not fetch issue text::${err.message}`);
  }
  process.exit(2);
});
