import { describe, it, expect } from 'vitest';
import { runAudit, gatherRepoWorld, FLEET_REPOS } from '../audit-stranded-branches.mjs';
import {
  auditWorld,
  buildViolations,
  isExcludedBranch,
  parseIssueNumber,
} from '../../lib/ops/stranded-branches.mjs';

describe('lib/ops/stranded-branches (pure)', () => {
  it('does NOT report a branch that has a PR', () => {
    const audit = auditWorld({
      repos: [
        {
          repo: 'ops',
          defaultBranch: 'main',
          branches: [{ name: 'claude/issue-5-feature', hasPr: true }],
        },
      ],
    });
    expect(audit.stranded).toEqual([]);
  });

  it('DOES report a branch with no PR, and parses its issue number', () => {
    const audit = auditWorld({
      repos: [
        {
          repo: 'ops',
          defaultBranch: 'main',
          branches: [
            {
              name: 'claude/issue-84-fix-something-ny7p91',
              hasPr: false,
              aheadBy: 2,
              compareStatus: 'ahead',
              lastCommitDate: '2026-07-08T00:00:00Z',
            },
          ],
        },
      ],
    });
    expect(audit.stranded).toHaveLength(1);
    expect(audit.stranded[0].issueNumber).toBe(84);
    expect(audit.stranded[0].commitsAhead).toBe(2);
    expect(audit.stranded[0].mergesCleanly).toBe(true);
    expect(audit.issuesWithStrandedBranch).toEqual([84]);
    expect(buildViolations(audit)).toHaveLength(1);
    expect(buildViolations(audit)[0].rule).toBe('STRANDED_BRANCH_NO_PR');
  });

  it('excludes ralph/claim-* markers', () => {
    expect(isExcludedBranch('ralph/claim-issue-330')).toBe(true);
    const audit = auditWorld({
      repos: [
        {
          repo: 'ops',
          defaultBranch: 'main',
          branches: [{ name: 'ralph/claim-issue-330', hasPr: false }],
        },
      ],
    });
    expect(audit.stranded).toEqual([]);
  });

  it('excludes archive/* subtrees', () => {
    expect(isExcludedBranch('archive/figma-bridge')).toBe(true);
  });

  it('excludes the repo-reported default branch, never a hardcoded "main"', () => {
    // folio's ACTUAL default is not "main" — a hardcoded check would fail to
    // exclude it and misreport it as stranded.
    const audit = auditWorld({
      repos: [
        {
          repo: 'folio',
          defaultBranch: 'claude/eloquent-ramanujan-9ag4uy',
          branches: [{ name: 'claude/eloquent-ramanujan-9ag4uy', hasPr: false }],
        },
      ],
    });
    expect(audit.stranded).toEqual([]);
  });

  it('an empty repo (no branches beyond default) returns ok:true / no violations', () => {
    const audit = auditWorld({ repos: [{ repo: 'ops', defaultBranch: 'main', branches: [] }] });
    expect(audit.stranded).toEqual([]);
    expect(buildViolations(audit)).toEqual([]);
  });

  it('parseIssueNumber returns null for a non-issue branch', () => {
    expect(parseIssueNumber('chore/ralph-setup')).toBeNull();
  });
});

describe('audit-stranded-branches: gatherRepoWorld / runAudit (no network — stubbed fetch)', () => {
  function fakeFetch({ defaultBranch, branchNames, prsByBranch = {}, compareByBranch = {} }) {
    return async (url) => {
      if (
        /\/repos\/[^/]+\/[^/]+$/.test(url) &&
        !url.includes('/branches') &&
        !url.includes('/pulls') &&
        !url.includes('/compare')
      ) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ default_branch: defaultBranch }),
        };
      }
      if (url.includes('/branches?')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => branchNames.map((name) => ({ name })),
        };
      }
      const branchDetailMatch = /\/branches\/([^?]+)$/.exec(url);
      if (branchDetailMatch) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            commit: { commit: { committer: { date: '2026-07-08T00:00:00Z' } } },
          }),
        };
      }
      if (url.includes('/pulls?')) {
        const m = /head=[^&]*%3A([^&]+)&/.exec(url) || /head=[^&]*:([^&]+)&/.exec(url);
        const branch = decodeURIComponent(m[1]);
        const has = prsByBranch[branch] ?? false;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => (has ? [{ number: 1 }] : []),
        };
      }
      if (url.includes('/compare/')) {
        const branch = decodeURIComponent(url.split('...')[1]);
        const c = compareByBranch[branch] ?? { ahead_by: 0, status: 'identical' };
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => c };
      }
      throw new Error(`unexpected URL in test stub: ${url}`);
    };
  }

  it('gathers a world where a PR-having branch is not marked stranded and a PR-less one is', async () => {
    const fetchImpl = fakeFetch({
      defaultBranch: 'main',
      branchNames: ['main', 'claude/has-pr', 'claude/issue-7-no-pr'],
      prsByBranch: { 'claude/has-pr': true, 'claude/issue-7-no-pr': false },
      compareByBranch: { 'claude/issue-7-no-pr': { ahead_by: 5, status: 'ahead' } },
    });
    const world = await gatherRepoWorld({ owner: 'hirobius', repo: 'ops', token: 't', fetchImpl });
    expect(world.defaultBranch).toBe('main');
    const audit = auditWorld({ repos: [world] });
    expect(audit.stranded).toHaveLength(1);
    expect(audit.stranded[0].branch).toBe('claude/issue-7-no-pr');
    expect(audit.stranded[0].issueNumber).toBe(7);
  });

  it('runAudit aggregates across repos and lists which issues have a stranded branch', async () => {
    const fetchImpl = fakeFetch({
      defaultBranch: 'main',
      branchNames: ['main', 'claude/issue-9-x'],
      prsByBranch: { 'claude/issue-9-x': false },
      compareByBranch: { 'claude/issue-9-x': { ahead_by: 1, status: 'ahead' } },
    });
    const result = await runAudit({ repos: ['ops'], owner: 'hirobius', token: 't', fetchImpl });
    expect(result.ok).toBe(true); // reporting gate — never fails its own run
    expect(result.violations).toHaveLength(1);
    expect(result.summary.issuesWithStrandedBranch).toEqual([9]);
    expect(result.summary.byRepo.ops).toBe(1);
  });

  it('FLEET_REPOS is the six-repo fleet the issue swept', () => {
    expect(FLEET_REPOS).toEqual(['ops', 'site-engine', 'hds', 'Ralph', 'folio', 'concrete']);
  });
});
