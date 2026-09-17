/**
 * Tests for scripts/client-digest.mjs — weekly status email draft.
 *
 * Refs: t_d1fb7fd7 / Client-augment — client-digest
 */

import { describe, it, expect } from 'vitest';
import { parseGitLog, bucketCommits, formatDigest } from '../client-digest.mjs';

describe('parseGitLog', () => {
  it('parses pipe-delimited %H|%aI|%s lines into commit records', () => {
    const text =
      'abc123|2026-05-08T10:00:00Z|feat(acme): retainer signed\n' +
      'def456|2026-05-09T11:00:00Z|fix(acme): drip-email typo';
    const commits = parseGitLog(text);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: 'abc123',
      date: '2026-05-08T10:00:00Z',
      subject: 'feat(acme): retainer signed',
    });
  });

  it('skips empty lines', () => {
    expect(parseGitLog('\nabc|2026-05-08T00:00:00Z|x\n\n')).toHaveLength(1);
  });

  it('returns [] for empty input', () => {
    expect(parseGitLog('')).toEqual([]);
  });
});

describe('bucketCommits', () => {
  const commits = [
    { sha: 'a', date: '2026-05-08T00:00:00Z', subject: 'feat(acme): retainer signed' },
    { sha: 'b', date: '2026-05-09T00:00:00Z', subject: 'fix(acme): drip-email typo' },
    { sha: 'c', date: '2026-05-10T00:00:00Z', subject: 'docs(acme): meeting notes' },
    { sha: 'd', date: '2026-05-10T00:00:00Z', subject: 'TODO: send proposal' },
    { sha: 'e', date: '2026-05-10T00:00:00Z', subject: 'BLOCKER: waiting on client' },
  ];

  it('puts feat/refactor/fix in shipped', () => {
    const r = bucketCommits(commits);
    expect(r.shipped.map((c) => c.sha)).toEqual(['a', 'b']);
  });

  it('puts TODO/NEXT subjects in next bucket', () => {
    const r = bucketCommits(commits);
    expect(r.next.some((c) => c.sha === 'd')).toBe(true);
  });

  it('puts BLOCKER subjects in blocker bucket', () => {
    const r = bucketCommits(commits);
    expect(r.blocker.some((c) => c.sha === 'e')).toBe(true);
  });

  it('puts everything else into other', () => {
    const r = bucketCommits(commits);
    expect(r.other.some((c) => c.sha === 'c')).toBe(true);
  });
});

describe('formatDigest', () => {
  const base = {
    slug: 'acme-agency',
    period: '7 days',
    sections: {
      shipped: [{ sha: 'a', date: '2026-05-08T00:00:00Z', subject: 'feat(acme): retainer signed' }],
      next: [{ sha: 'd', date: '2026-05-10T00:00:00Z', subject: 'TODO: send proposal' }],
      blocker: [],
      other: [],
    },
  };

  it('emits a markdown heading with the slug and period', () => {
    const md = formatDigest(base);
    expect(md).toMatch(/# .*acme-agency/);
    expect(md).toMatch(/7 days/);
  });

  it('lists Shipped section with bullets', () => {
    const md = formatDigest(base);
    expect(md).toMatch(/## Shipped/);
    expect(md).toMatch(/- retainer signed/);
  });

  it('omits Blocker section when empty', () => {
    const md = formatDigest(base);
    expect(md).not.toMatch(/## Blockers?/);
  });

  it('includes Blocker section when present', () => {
    const md = formatDigest({
      ...base,
      sections: {
        ...base.sections,
        blocker: [
          { sha: 'e', date: '2026-05-10T00:00:00Z', subject: 'BLOCKER: waiting on client' },
        ],
      },
    });
    expect(md).toMatch(/## Blockers?/);
    expect(md).toMatch(/waiting on client/);
  });

  it('returns a "no activity" line when all sections are empty', () => {
    const md = formatDigest({
      slug: 'x',
      period: '7 days',
      sections: { shipped: [], next: [], blocker: [], other: [] },
    });
    expect(md.toLowerCase()).toMatch(/no activity/);
  });
});
