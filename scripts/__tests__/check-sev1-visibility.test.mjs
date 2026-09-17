/**
 * check-sev1-visibility (ops#317) — lists every open sev1 and exits non-zero
 * while any exists. Warn severity: it reports, it never blocks a commit.
 *
 * The pure half is tested against in-memory rows; the CLI is exercised end to
 * end against the same fixtures validate-fixture-proof-of-firing runs, so a
 * green suite means the gate demonstrably fires on an open sev1 and stays quiet
 * without one — not merely that its helpers return the right shapes.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_OWNERS,
  searchArgs,
  normalizeSearchResults,
  fetchOpenSev1Issues,
  ghFailureMessage,
  sev1Violations,
  formatReport,
} from '../check-sev1-visibility.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/check-sev1-visibility.mjs');
const FIXTURES = resolve(ROOT, 'fixtures/check-sev1-visibility');

/** One row as `gh search issues --json repository,number,title,url,labels,state` returns it. */
function searchRow(over = {}) {
  return {
    repository: { name: 'ops', nameWithOwner: 'hirobius/ops' },
    number: 27,
    title: 'security: rewrite git history to purge client PII from the public repo',
    url: 'https://github.com/hirobius/ops/issues/27',
    state: 'open',
    labels: [{ name: 'sev1' }, { name: 'p1' }],
    ...over,
  };
}

describe('searchArgs', () => {
  it('asks gh for open sev1 issues under one owner, as JSON', () => {
    expect(searchArgs('hirobius')).toEqual([
      'search',
      'issues',
      '--owner',
      'hirobius',
      '--label',
      'sev1',
      '--state',
      'open',
      '--json',
      'repository,number,title,url,labels,state',
      '--limit',
      '100',
    ]);
  });

  it('defaults to the hirobius owner, where the ladder labels live (ops + hds)', () => {
    expect(DEFAULT_OWNERS).toEqual(['hirobius']);
  });
});

describe('normalizeSearchResults', () => {
  it('flattens repository and label objects into the shared issue shape', () => {
    expect(normalizeSearchResults([searchRow()])).toEqual([
      {
        repo: 'hirobius/ops',
        number: 27,
        title: 'security: rewrite git history to purge client PII from the public repo',
        url: 'https://github.com/hirobius/ops/issues/27',
        state: 'open',
        labels: ['sev1', 'p1'],
      },
    ]);
  });

  it('returns nothing for a non-array', () => {
    expect(normalizeSearchResults(null)).toEqual([]);
  });
});

describe('fetchOpenSev1Issues', () => {
  it('searches each owner, merges, de-duplicates and keeps only open sev1', async () => {
    const run = vi.fn((args) => {
      const owner = args[args.indexOf('--owner') + 1];
      if (owner === 'hirobius') {
        return JSON.stringify([
          searchRow(),
          // Search is a query, not a promise: re-filter what comes back.
          searchRow({ number: 35, labels: [{ name: 'sev2' }] }),
          searchRow({ number: 99, state: 'closed' }),
        ]);
      }
      return JSON.stringify([
        searchRow(),
        searchRow({
          repository: { name: 'access', nameWithOwner: 'adr-eng/access' },
          number: 3,
          url: 'https://github.com/adr-eng/access/issues/3',
        }),
      ]);
    });

    const out = await fetchOpenSev1Issues({ owners: ['hirobius', 'adr-eng'], run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(out.map((i) => `${i.repo}#${i.number}`)).toEqual([
      'adr-eng/access#3',
      'hirobius/ops#27',
    ]);
  });

  it('fails loud, naming the fix, when gh cannot answer', async () => {
    const run = () => {
      throw new Error('gh: To get started with GitHub CLI, please run: gh auth login');
    };
    await expect(fetchOpenSev1Issues({ owners: ['hirobius'], run })).rejects.toThrow(
      /gh auth login/,
    );
  });

  it('fails loud when gh answers with something that is not JSON', async () => {
    await expect(
      fetchOpenSev1Issues({ owners: ['hirobius'], run: () => '<html>' }),
    ).rejects.toThrow(/not JSON/);
  });
});

describe('ghFailureMessage', () => {
  // A check that silently reports "no sev1" when it could not look is the one
  // failure this gate must never have — it would read as all-clear.
  it('names both ways to authenticate and says the result is unknown, not clean', () => {
    const msg = ghFailureMessage(new Error('HTTP 401'));
    expect(msg).toContain('HTTP 401');
    expect(msg).toContain('gh auth login');
    expect(msg).toContain('GH_TOKEN');
    expect(msg).toMatch(/unknown/i);
  });
});

describe('sev1Violations', () => {
  it('emits one warn-severity violation per open sev1, in the canonical shape', () => {
    const [v, ...rest] = sev1Violations([
      {
        repo: 'hirobius/ops',
        number: 27,
        title: 'purge client PII',
        url: 'https://github.com/hirobius/ops/issues/27',
      },
    ]);
    expect(rest).toEqual([]);
    expect(v).toEqual({
      file: '*',
      line: null,
      rule: 'open-sev1',
      severity: 'warn',
      message: 'hirobius/ops#27 — purge client PII (https://github.com/hirobius/ops/issues/27)',
      repo: 'hirobius/ops',
      number: 27,
      url: 'https://github.com/hirobius/ops/issues/27',
    });
  });

  it('is empty when nothing is open at sev1', () => {
    expect(sev1Violations([])).toEqual([]);
  });
});

describe('formatReport', () => {
  it('says so plainly when there is no open sev1', () => {
    expect(formatReport([])).toMatch(/no open sev1/);
  });

  it('lists each open sev1 with its link and restates what sev1 means', () => {
    const text = formatReport([
      { repo: 'hirobius/ops', number: 27, title: 'purge client PII', url: 'https://x/27' },
      { repo: 'hirobius/hds', number: 4, title: 'hds fire', url: 'https://x/4' },
    ]);
    expect(text).toMatch(/2 open sev1/);
    expect(text).toContain('hirobius/ops#27');
    expect(text).toContain('https://x/27');
    expect(text).toContain('hirobius/hds#4');
    expect(text).toContain('Legal exposure, security incident, data loss');
    expect(text).toMatch(/until it is closed/);
    // Adrian, 2026-09-16: accepting a sev1 without closing it has exactly one route —
    // relabel it sev2, with a comment on the issue giving the reason. Bare unlabelling is not one.
    expect(text).toMatch(
      /only way to accept one without closing it: relabel it sev2 with a comment on the issue giving the reason/,
    );
    expect(text).not.toMatch(/Removing the sev1 label|saying why/);
  });
});

// ── the CLI against the proof-of-firing fixtures ────────────────────────────

function runGate(fixture, extraArgs = []) {
  return spawnSync(process.execPath, [SCRIPT, '--fixture-mode', ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FIXTURE_FILE: resolve(FIXTURES, fixture), HDS_FIXTURE_MODE: '1' },
    timeout: 15_000,
  });
}

describe('CLI (fixture mode)', () => {
  it('fires on a repo state with an open sev1 — exit 1, issue named', () => {
    const res = runGate('violating.example.json');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('hirobius/ops#27');
  });

  it('stays quiet on a repo state with no open sev1 — exit 0', () => {
    const res = runGate('passing.example.json');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/no open sev1/);
  });

  it('emits the canonical --json shape', () => {
    const res = runGate('violating.example.json', ['--json']);
    expect(res.status).toBe(1);
    const body = JSON.parse(res.stdout);
    expect(body.ok).toBe(false);
    expect(body.violations.map((v) => v.rule)).toEqual(['open-sev1']);
    expect(body.summary).toEqual({ openSev1: 1 });
  });
});
