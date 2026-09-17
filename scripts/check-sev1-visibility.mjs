#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Lists every open `sev1` issue and exits non-zero while any exists (ops#317).
 *
 * The severity axis (`lib/tasks/severity.mjs`) is orthogonal to p0–p3: priority
 * says when, severity says what happens if we don't. `sev1` is legal exposure, a
 * security incident, data loss, or harm already reaching a real third party.
 *
 * Why a gate: ops#27 — client PII in a public git history, with an unmet
 * disclosure obligation — sat at `p1` for 71 days. It surfaced only because a
 * session happened to sweep every needs-human issue by hand. The repo had dozens
 * of guardrails for correctness and nothing for risk. A sev1 must not be one
 * line among fifty, so this prints them on their own and fails while any is open.
 * Accepting one without closing it has exactly one route (CLAUDE.md §0): relabel
 * it sev2 with a comment on the issue giving the reason.
 *
 * Warn severity, `pnpm sev1:check` (pnpm-meta, so `pnpm review:daily` runs it
 * too). It reports; it never blocks a commit. /ops/standing shows the same list
 * without running anything (`lib/tasks/fleet.mjs` → `sev1`).
 *
 * Read-only. Uses `gh search issues`, one call per owner — the ladder labels
 * live in hirobius/ops and hirobius/hds, so the default owner is `hirobius`.
 * If gh cannot answer, the result is UNKNOWN and this says so loudly; it never
 * degrades to "no open sev1", which would read as all-clear.
 *
 * Usage:
 *   node scripts/check-sev1-visibility.mjs                 # human report
 *   node scripts/check-sev1-visibility.mjs --json          # canonical { violations } shape
 *   node scripts/check-sev1-visibility.mjs --owner adr-eng # repeatable; replaces the default
 *
 * Fixture mode (proof-of-firing): with `--fixture-mode` and FIXTURE_FILE set,
 * reads `{ "issues": [...] }` from that file instead of calling gh.
 *
 * Exit codes: 0 no open sev1 · 1 at least one open sev1 (or --json lookup
 * failure) · 2 invocation/lookup error in human mode.
 *
 * @module check-sev1-visibility
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { SEVERITY_LADDER, openSev1 } from '../lib/tasks/severity.mjs';

export const DEFAULT_OWNERS = ['hirobius'];

const SEV1 = SEVERITY_LADDER[0];

/** `gh` argv for one owner's open sev1 issues. */
export function searchArgs(owner) {
  return [
    'search',
    'issues',
    '--owner',
    owner,
    '--label',
    'sev1',
    '--state',
    'open',
    '--json',
    'repository,number,title,url,labels,state',
    '--limit',
    '100',
  ];
}

/**
 * `gh search issues --json` rows → the shared issue shape the severity module reads.
 *
 * @param {unknown} rows
 */
export function normalizeSearchResults(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    repo: r?.repository?.nameWithOwner ?? '',
    number: r?.number,
    title: r?.title ?? '',
    url: r?.url ?? '',
    state: r?.state,
    labels: (Array.isArray(r?.labels) ? r.labels : []).map((l) =>
      typeof l === 'string' ? l : l?.name,
    ),
  }));
}

/** The actionable message when gh cannot list issues. */
export function ghFailureMessage(err) {
  const detail = String(err?.stderr || err?.message || err).trim();
  return (
    `gh could not list sev1 issues (${detail}). Open sev1 status is UNKNOWN, not clean. ` +
    'Run `gh auth login`, or set GH_TOKEN to a token that can read issues ' +
    '(https://github.com/settings/personal-access-tokens), then re-run `pnpm sev1:check`.'
  );
}

function defaultRun(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

/**
 * Every open sev1 under the given owners. Search results are re-filtered
 * through `openSev1` — a search is a query, not a guarantee — and de-duplicated.
 *
 * @param {{ owners?: string[], run?: (args: string[]) => string }} [opts]
 */
export async function fetchOpenSev1Issues({ owners = DEFAULT_OWNERS, run = defaultRun } = {}) {
  const seen = new Map();
  for (const owner of owners) {
    let stdout;
    try {
      stdout = run(searchArgs(owner));
    } catch (err) {
      throw new Error(ghFailureMessage(err));
    }
    let rows;
    try {
      rows = JSON.parse(stdout);
    } catch {
      throw new Error(
        ghFailureMessage(new Error(`gh returned output that is not JSON for owner "${owner}"`)),
      );
    }
    for (const issue of normalizeSearchResults(rows)) {
      seen.set(`${issue.repo}#${issue.number}`, issue);
    }
  }
  return openSev1([...seen.values()]);
}

/** One warn-severity violation per open sev1. */
export function sev1Violations(open) {
  return open.map((i) => ({
    file: '*',
    line: null,
    rule: 'open-sev1',
    severity: 'warn',
    message: `${i.repo}#${i.number} — ${i.title} (${i.url})`,
    repo: i.repo,
    number: i.number,
    url: i.url,
  }));
}

/** Human report. */
export function formatReport(open) {
  if (open.length === 0) return '✓ check-sev1-visibility — no open sev1.';
  const lines = [
    `✗ ${open.length} open sev1 — ${SEV1.means}.`,
    '',
    ...open.flatMap((i) => [`  • ${i.repo}#${i.number} — ${i.title}`, `      ${i.url}`]),
    '',
    'A sev1 stays on this list and on /ops/standing until it is closed.',
    'The only way to accept one without closing it: relabel it sev2 with a comment on the issue giving the reason.',
  ];
  return lines.join('\n');
}

function ownersFromArgv(argv) {
  const owners = [];
  argv.forEach((a, i) => {
    if (a === '--owner' && argv[i + 1]) owners.push(argv[i + 1]);
  });
  return owners.length ? owners : DEFAULT_OWNERS;
}

function report(open, jsonMode) {
  if (jsonMode) {
    emitResult(
      {
        violations: sev1Violations(open),
        summary: { openSev1: open.length },
        ok: open.length === 0,
      },
      true,
    );
  } else {
    console.log(formatReport(open));
  }
  process.exit(open.length === 0 ? 0 : 1);
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';

  if (fixtureMode && process.env.FIXTURE_FILE) {
    const fixture = JSON.parse(readFileSync(process.env.FIXTURE_FILE, 'utf8'));
    return report(openSev1(fixture.issues), jsonMode);
  }

  let open;
  try {
    open = await fetchOpenSev1Issues({ owners: ownersFromArgv(argv) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (jsonMode) {
      emitResult(
        {
          violations: [{ file: '*', line: null, rule: 'gate-error', severity: 'error', message }],
          ok: false,
        },
        true,
      );
      process.exit(1);
    }
    console.error(`check-sev1-visibility: ${message}`);
    process.exit(2);
  }
  return report(open, jsonMode);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
