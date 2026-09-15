/**
 * tests/api/stale-closure.test.ts — ops#305.
 *
 * Covers the two failure shapes behind the loop's worst thrash: a merged Ralph
 * PR whose issue never auto-closed (#156 re-claimed the same finished work 12+
 * times in ~12 hours), and the PR-body form that causes it (#53 wrote
 * `Closes **#44**`; GitHub's closing-keyword parser did not match).
 */
import { describe, it, expect } from 'vitest';
import {
  issueNumberFromRalphBranch,
  hasBreakableClosingKeyword,
  findStaleClosures,
} from '../../lib/tasks/stale-closure.mjs';

describe('issueNumberFromRalphBranch', () => {
  it('parses the canonical branch shape', () => {
    expect(issueNumberFromRalphBranch('ralph/issue-185-wire-render-action')).toBe(185);
    expect(issueNumberFromRalphBranch('ralph/issue-44-preview-url')).toBe(44);
  });
  it('accepts a slugless branch', () => {
    expect(issueNumberFromRalphBranch('ralph/issue-7')).toBe(7);
  });
  it('rejects non-Ralph branches', () => {
    expect(issueNumberFromRalphBranch('claude/some-session-branch')).toBeNull();
    expect(issueNumberFromRalphBranch('main')).toBeNull();
    expect(issueNumberFromRalphBranch('docs/burndown-gameplan')).toBeNull();
  });
  it('rejects a malformed issue segment', () => {
    expect(issueNumberFromRalphBranch('ralph/issue-abc-thing')).toBeNull();
    expect(issueNumberFromRalphBranch('ralph/issue--thing')).toBeNull();
  });
  it('is null-safe', () => {
    expect(issueNumberFromRalphBranch(null)).toBeNull();
    expect(issueNumberFromRalphBranch(undefined)).toBeNull();
    expect(issueNumberFromRalphBranch('')).toBeNull();
  });
});

describe('hasBreakableClosingKeyword', () => {
  it('flags bold around the reference (the ops#44 regression)', () => {
    expect(hasBreakableClosingKeyword('Closes **#44**')).toBe(true);
  });
  it('flags italic and code spans around the reference', () => {
    expect(hasBreakableClosingKeyword('Fixes _#12_')).toBe(true);
    expect(hasBreakableClosingKeyword('Resolves `#9`')).toBe(true);
    expect(hasBreakableClosingKeyword('closes *#3*')).toBe(true);
  });
  it('is case-insensitive on the keyword', () => {
    expect(hasBreakableClosingKeyword('CLOSES **#44**')).toBe(true);
  });
  it('accepts the bare working form', () => {
    expect(hasBreakableClosingKeyword('Closes #44')).toBe(false);
    expect(hasBreakableClosingKeyword('Fixes #12\n\nSome detail.')).toBe(false);
  });
  it('does not flag prose that merely contains the verb', () => {
    expect(hasBreakableClosingKeyword('This closes the gap described in #44')).toBe(false);
    expect(hasBreakableClosingKeyword('The **bold text** mentions #44 later')).toBe(false);
  });
  it('is null-safe', () => {
    expect(hasBreakableClosingKeyword(null)).toBe(false);
    expect(hasBreakableClosingKeyword('')).toBe(false);
  });
});

describe('findStaleClosures', () => {
  const openIssues = [{ number: 44 }, { number: 156 }, { number: 185 }];

  it('flags a merged Ralph PR whose issue is still open', () => {
    const out = findStaleClosures({
      prs: [{ number: 53, headRef: 'ralph/issue-44-preview-url', merged: true }],
      openIssues,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ issueNumber: 44, prNumbers: [53] });
  });

  it('ignores a merged PR whose issue already closed', () => {
    expect(
      findStaleClosures({
        prs: [{ number: 99, headRef: 'ralph/issue-77-done', merged: true }],
        openIssues,
      }),
    ).toEqual([]);
  });

  it('ignores an unmerged PR even when the issue is open', () => {
    expect(
      findStaleClosures({
        prs: [{ number: 244, headRef: 'ralph/issue-185-wire-render', merged: false }],
        openIssues,
      }),
    ).toEqual([]);
  });

  it('ignores non-Ralph branches', () => {
    expect(
      findStaleClosures({
        prs: [{ number: 231, headRef: 'claude/agency-legal-and-log', merged: true }],
        openIssues,
      }),
    ).toEqual([]);
  });

  it('reports each stale issue once even with several merged PRs (the #156 shape)', () => {
    const out = findStaleClosures({
      prs: [
        { number: 162, headRef: 'ralph/issue-156-first', merged: true },
        { number: 163, headRef: 'ralph/issue-156-second', merged: true },
      ],
      openIssues,
    });
    expect(out).toHaveLength(1);
    expect(out[0].issueNumber).toBe(156);
    expect(out[0].prNumbers).toEqual([162, 163]);
  });

  it('is empty-safe', () => {
    expect(findStaleClosures({ prs: [], openIssues: [] })).toEqual([]);
    expect(findStaleClosures({})).toEqual([]);
  });
});
