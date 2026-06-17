/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Unit tests for scripts/dispatch-pod.mjs
 *
 * `inspectIsolation` and `verifyBase` are pure relative to the injected
 * `git` callback, so each test stubs git output to assert on the
 * isolation rules without touching the real filesystem or repo.
 */

import { describe, it, expect } from 'vitest';
import { inspectIsolation, verifyBase } from '../dispatch-pod.mjs';

const REPO = '/home/adrian/projects/adrian-milsap';
const WORKTREE = `${REPO}/.claude/worktrees/agent-abc123def456`;
const WORKTREE_BRANCH = 'worktree-agent-abc123def456';
const COMMON_GIT = `${REPO}/.git`;
const LINKED_GIT = `${COMMON_GIT}/worktrees/agent-abc123def456`;

function fakeGit(map) {
  return (cmd) => {
    if (!(cmd in map)) throw new Error(`unexpected git cmd: ${cmd}`);
    const value = map[cmd];
    if (value instanceof Error) throw value;
    return value;
  };
}

describe('inspectIsolation', () => {
  it('reports isolated when cwd, branch, and git dirs all confirm a linked worktree', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': WORKTREE_BRANCH,
      'git rev-parse --absolute-git-dir': LINKED_GIT,
      'git rev-parse --path-format=absolute --git-common-dir': COMMON_GIT,
    });
    const r = inspectIsolation({ cwd: WORKTREE, git });
    expect(r.isolated).toBe(true);
    expect(r.isWorktreePath).toBe(true);
    expect(r.isWorktreeBranch).toBe(true);
    expect(r.isLinkedWorktree).toBe(true);
    expect(r.diagnostic).toEqual([]);
  });

  it('flags isolation FAIL when cwd is the main worktree even if branch looks worktree-ish', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': WORKTREE_BRANCH,
      'git rev-parse --absolute-git-dir': COMMON_GIT,
      'git rev-parse --path-format=absolute --git-common-dir': COMMON_GIT,
    });
    const r = inspectIsolation({ cwd: REPO, git });
    expect(r.isolated).toBe(false);
    expect(r.isWorktreePath).toBe(false);
    expect(r.isLinkedWorktree).toBe(false);
    expect(r.diagnostic.some((d) => d.includes('parent worktree'))).toBe(true);
    expect(r.diagnostic.some((d) => d.includes('main worktree'))).toBe(true);
  });

  it('flags isolation FAIL when current branch is the source branch (fix/ui-pipeline)', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': 'fix/ui-pipeline',
      'git rev-parse --absolute-git-dir': COMMON_GIT,
      'git rev-parse --path-format=absolute --git-common-dir': COMMON_GIT,
    });
    const r = inspectIsolation({ cwd: REPO, git });
    expect(r.isolated).toBe(false);
    expect(r.isWorktreeBranch).toBe(false);
    expect(r.diagnostic.some((d) => d.includes("'fix/ui-pipeline'"))).toBe(true);
  });

  it('flags isolation FAIL when cwd path is in worktree but branch is wrong (race condition)', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --absolute-git-dir': LINKED_GIT,
      'git rev-parse --path-format=absolute --git-common-dir': COMMON_GIT,
    });
    const r = inspectIsolation({ cwd: WORKTREE, git });
    expect(r.isolated).toBe(false);
    expect(r.isWorktreePath).toBe(true);
    expect(r.isLinkedWorktree).toBe(true);
    expect(r.isWorktreeBranch).toBe(false);
  });

  it('captures git failure as a diagnostic without throwing', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': new Error('not a git repo'),
    });
    const r = inspectIsolation({ cwd: REPO, git });
    expect(r.isolated).toBe(false);
    expect(r.diagnostic.some((d) => d.includes('git inspection failed'))).toBe(true);
  });

  it('matches worktree path with hex agent id only — rejects arbitrary nested paths', () => {
    const git = fakeGit({
      'git rev-parse --abbrev-ref HEAD': WORKTREE_BRANCH,
      'git rev-parse --absolute-git-dir': LINKED_GIT,
      'git rev-parse --path-format=absolute --git-common-dir': COMMON_GIT,
    });
    const r = inspectIsolation({ cwd: `${REPO}/.claude/worktrees/something-else`, git });
    expect(r.isWorktreePath).toBe(false);
    expect(r.isolated).toBe(false);
  });
});

describe('verifyBase', () => {
  it('returns ok: true when merge-base equals base ref tip', () => {
    const baseSha = 'a542614abcdef1234567890abcdef1234567890ab';
    const git = fakeGit({
      'git rev-parse fix/ui-pipeline': baseSha,
      'git merge-base HEAD fix/ui-pipeline': baseSha,
    });
    const r = verifyBase({ cwd: WORKTREE, baseRef: 'fix/ui-pipeline', git });
    expect(r.ok).toBe(true);
    expect(r.diagnostic).toEqual([]);
  });

  it('returns ok: false with a stale-base diagnostic when merge-base diverges', () => {
    const git = fakeGit({
      'git rev-parse fix/ui-pipeline': 'aaaaaaaa',
      'git merge-base HEAD fix/ui-pipeline': 'bbbbbbbb',
    });
    const r = verifyBase({ cwd: WORKTREE, baseRef: 'fix/ui-pipeline', git });
    expect(r.ok).toBe(false);
    expect(r.diagnostic[0]).toMatch(/stale or HEAD diverged/);
  });

  it('returns ok: false with a resolution failure diagnostic when ref does not exist', () => {
    const git = fakeGit({
      'git rev-parse no-such-branch': new Error("fatal: ambiguous argument 'no-such-branch'"),
    });
    const r = verifyBase({ cwd: WORKTREE, baseRef: 'no-such-branch', git });
    expect(r.ok).toBe(false);
    expect(r.diagnostic[0]).toMatch(/could not be resolved/);
  });
});
