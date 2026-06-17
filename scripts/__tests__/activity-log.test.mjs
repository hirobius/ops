/**
 * Tests for scripts/activity-log.mjs — git log → portfolio activity bullets.
 *
 * Refs: t_2f4563eb / Self bundle — activity-log
 */

import { describe, it, expect } from 'vitest';
import { parseGitLog, clusterByScope, formatActivityLog } from '../activity-log.mjs';

describe('parseGitLog', () => {
  it('parses %H|%aI|%s lines', () => {
    expect(parseGitLog('a|2026-05-08T00:00:00Z|feat(lilac): x')).toEqual([
      { sha: 'a', date: '2026-05-08T00:00:00Z', subject: 'feat(lilac): x' },
    ]);
  });
});

describe('clusterByScope', () => {
  const commits = [
    { sha: 'a', date: '', subject: 'feat(lilac): retainer signed' },
    { sha: 'b', date: '', subject: 'fix(lilac): drip typo' },
    { sha: 'c', date: '', subject: 'feat(seo): pre-deploy hygiene' },
    { sha: 'd', date: '', subject: 'docs: misc cleanup' },
    { sha: 'e', date: '', subject: 'random subject without prefix' },
  ];

  it('groups commits by the scope in feat(scope): / fix(scope): prefixes', () => {
    const r = clusterByScope(commits);
    expect(r.get('lilac').length).toBe(2);
    expect(r.get('seo').length).toBe(1);
  });

  it('puts prefix-less / scope-less commits in the "misc" bucket', () => {
    const r = clusterByScope(commits);
    expect(r.get('misc').map((c) => c.sha)).toEqual(['d', 'e']);
  });

  it('returns a Map preserving first-seen insertion order', () => {
    const r = clusterByScope(commits);
    expect([...r.keys()]).toEqual(['lilac', 'seo', 'misc']);
  });
});

describe('formatActivityLog', () => {
  it('emits a heading with the period', () => {
    const md = formatActivityLog({ clusters: new Map(), period: '7 days', total: 0 });
    expect(md).toMatch(/Activity log — last 7 days/);
  });

  it('reports "no activity" when clusters is empty', () => {
    const md = formatActivityLog({ clusters: new Map(), period: '7 days', total: 0 });
    expect(md.toLowerCase()).toMatch(/no activity/);
  });

  it('lists each cluster as its own ## section with bullets', () => {
    const clusters = new Map([
      ['lilac', [{ sha: 'a', date: '', subject: 'feat(lilac): retainer signed' }]],
      ['seo', [{ sha: 'b', date: '', subject: 'feat(seo): hygiene' }]],
    ]);
    const md = formatActivityLog({ clusters, period: '7 days', total: 2 });
    expect(md).toMatch(/## lilac \(1\)/);
    expect(md).toMatch(/## seo \(1\)/);
    expect(md).toMatch(/- retainer signed/);
  });

  it('shows the total commit count in the heading line', () => {
    const md = formatActivityLog({ clusters: new Map([['x', []]]), period: '7 days', total: 9 });
    expect(md).toMatch(/9 commit/);
  });
});
