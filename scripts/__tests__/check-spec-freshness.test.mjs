/**
 * Unit tests for scripts/check-spec-freshness.mjs (ops#294).
 *
 * Header/issue parsing and the per-spec rule evaluation are pure — tested
 * directly, including against the fixtures/check-spec-freshness/*.example.md
 * files the DoD asks for. `fetchIssueStates` takes an injectable `fetchImpl`,
 * so its request/error handling is exercised with a stubbed client — no
 * network, same pattern as metric-north-star-share.mjs (ops#293).
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SPEC_STATUSES,
  STALE_DAYS,
  parseSpecHeader,
  extractIssueNumbers,
  evaluateSpec,
  listSpecFiles,
  fetchIssueStates,
} from '../check-spec-freshness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'fixtures', 'check-spec-freshness');
const NOW = new Date('2026-09-16T00:00:00Z').getTime();

function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parseSpecHeader', () => {
  it('parses a well-formed header', () => {
    const md = '# Epic\n\nStatus: active\nLast verified: 2026-09-10\n\n## Outcome\n';
    expect(parseSpecHeader(md)).toEqual({
      status: 'active',
      statusRaw: 'active',
      lastVerified: '2026-09-10',
      lastVerifiedRaw: '2026-09-10',
    });
  });

  it('is case-insensitive on the status value', () => {
    const md = 'Status: Active\nLast verified: 2026-09-10\n';
    expect(parseSpecHeader(md).status).toBe('active');
  });

  it('returns null status for an unrecognized value', () => {
    const md = 'Status: paused\nLast verified: 2026-09-10\n';
    const parsed = parseSpecHeader(md);
    expect(parsed.status).toBeNull();
    expect(parsed.statusRaw).toBe('paused');
  });

  it('returns null lastVerified for a malformed date', () => {
    const md = 'Status: active\nLast verified: YYYY-MM-DD\n';
    expect(parseSpecHeader(md).lastVerified).toBeNull();
  });

  it('returns nulls when both header lines are absent', () => {
    expect(parseSpecHeader('# Epic\n\n## Outcome\nno headers here\n')).toEqual({
      status: null,
      statusRaw: null,
      lastVerified: null,
      lastVerifiedRaw: null,
    });
  });

  it('does not read a Status: line that only appears after the header block', () => {
    // Body prose mentioning "Status:" past the first ## heading must not count.
    const md = '# Epic\n\n## Outcome\nStatus: this is body text, not a header\n';
    expect(parseSpecHeader(md).status).toBeNull();
  });
});

describe('extractIssueNumbers', () => {
  it('reads the header Issues: line', () => {
    const md = 'Status: active\nIssues: #185 (p0) · #186 (p1, blocked)\n\n## Outcome\n';
    expect(extractIssueNumbers(md)).toEqual([185, 186]);
  });

  it('reads issue refs from a ## Tasks table', () => {
    const md =
      '# Epic\n\n## Tasks\n\n| # | Issue | Slice |\n|---|---|---|\n| 1 | #10 | a |\n| 2 | #11 | b |\n';
    expect(extractIssueNumbers(md)).toEqual([10, 11]);
  });

  it('merges and dedupes refs from both the header and the Tasks table', () => {
    const md =
      'Issues: #10 · #11\n\n## Tasks\n\n| # | Issue |\n|---|---|\n| 1 | #11 |\n| 2 | #12 |\n';
    expect(extractIssueNumbers(md)).toEqual([10, 11, 12]);
  });

  it('returns an empty array when nothing is referenced', () => {
    expect(extractIssueNumbers('Status: draft\n\n## Outcome\n')).toEqual([]);
  });
});

describe('evaluateSpec — fixtures/check-spec-freshness', () => {
  it('fresh active: no violations', () => {
    const violations = evaluateSpec({
      file: 'fresh-active.example.md',
      markdown: fixture('fresh-active.example.md'),
      now: NOW,
    });
    expect(violations).toEqual([]);
  });

  it('stale active: flags SPEC_STALE_LAST_VERIFIED', () => {
    const violations = evaluateSpec({
      file: 'stale-active.example.md',
      markdown: fixture('stale-active.example.md'),
      now: NOW,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('SPEC_STALE_LAST_VERIFIED');
    expect(violations[0].message).toContain(`>${STALE_DAYS}`);
  });

  it('all-issues-closed active: flags SPEC_SHOULD_BE_SHIPPED once both issues report closed', () => {
    const issueState = new Map([
      [501, 'closed'],
      [502, 'closed'],
    ]);
    const violations = evaluateSpec({
      file: 'all-issues-closed-active.example.md',
      markdown: fixture('all-issues-closed-active.example.md'),
      now: NOW,
      issueState,
    });
    expect(violations).toEqual([expect.objectContaining({ rule: 'SPEC_SHOULD_BE_SHIPPED' })]);
  });

  it('all-issues-closed active: no SPEC_SHOULD_BE_SHIPPED while one issue is still open', () => {
    const issueState = new Map([
      [501, 'closed'],
      [502, 'open'],
    ]);
    const violations = evaluateSpec({
      file: 'all-issues-closed-active.example.md',
      markdown: fixture('all-issues-closed-active.example.md'),
      now: NOW,
      issueState,
    });
    expect(violations.find((v) => v.rule === 'SPEC_SHOULD_BE_SHIPPED')).toBeUndefined();
  });

  it('all-issues-closed active: an unresolved issue ref is flagged and blocks the all-closed verdict', () => {
    const issueState = new Map([[501, 'closed']]); // #502 absent — doesn't exist
    const violations = evaluateSpec({
      file: 'all-issues-closed-active.example.md',
      markdown: fixture('all-issues-closed-active.example.md'),
      now: NOW,
      issueState,
    });
    expect(violations).toEqual([
      expect.objectContaining({
        rule: 'SPEC_UNKNOWN_ISSUE_REF',
        message: expect.stringContaining('#502'),
      }),
    ]);
  });

  it('shipped: exempt from every check, even a stale date and an unresolvable issue ref', () => {
    const violations = evaluateSpec({
      file: 'shipped.example.md',
      markdown: fixture('shipped.example.md'),
      now: NOW,
      issueState: new Map(), // #601 deliberately absent
    });
    expect(violations).toEqual([]);
  });

  it('missing header: flags both the missing Status and missing Last verified header', () => {
    const violations = evaluateSpec({
      file: 'missing-header.example.md',
      markdown: fixture('missing-header.example.md'),
      now: NOW,
    });
    expect(violations.map((v) => v.rule).sort()).toEqual([
      'SPEC_MISSING_LAST_VERIFIED_HEADER',
      'SPEC_MISSING_STATUS_HEADER',
    ]);
  });
});

describe('SPEC_STATUSES', () => {
  it('is the four-value doctrine vocabulary', () => {
    expect(SPEC_STATUSES).toEqual(['draft', 'active', 'shipped', 'abandoned']);
  });
});

describe('listSpecFiles', () => {
  it('lists real epic files, excluding README.md and _template.md', () => {
    const files = listSpecFiles(join(ROOT, 'docs', 'specs')).map((f) => f.split('/').pop());
    expect(files).toContain('leads-to-site.md');
    expect(files).not.toContain('README.md');
    expect(files).not.toContain('_template.md');
  });

  it('returns an empty array for a directory that does not exist', () => {
    expect(listSpecFiles(join(ROOT, 'docs', 'specs-does-not-exist'))).toEqual([]);
  });
});

describe('fetchIssueStates', () => {
  it('maps each issue number to its state', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const n = Number(url.match(/issues\/(\d+)$/)[1]);
      return {
        status: 200,
        ok: true,
        json: async () => ({ state: n === 1 ? 'open' : 'closed' }),
      };
    });
    const map = await fetchIssueStates({
      repo: 'hirobius/ops',
      numbers: [1, 2],
      token: 't',
      fetchImpl,
    });
    expect(map).toEqual(
      new Map([
        [1, 'open'],
        [2, 'closed'],
      ]),
    );
  });

  it('leaves a 404 out of the map rather than erroring', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 404, ok: false }));
    const map = await fetchIssueStates({
      repo: 'hirobius/ops',
      numbers: [999],
      token: 't',
      fetchImpl,
    });
    expect(map.has(999)).toBe(false);
  });

  it('throws an actionable message on a 401/403 (expired/revoked token)', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 401, ok: false }));
    await expect(
      fetchIssueStates({ repo: 'hirobius/ops', numbers: [1], token: 't', fetchImpl }),
    ).rejects.toThrow(/GITHUB_TOKEN/);
  });
});
