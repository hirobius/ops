// @vitest-environment node
/**
 * lib/tasks/reconcile-github-tasks.mjs — pure set-diff between stored and
 * live GitHub-issue task keys. No network, no DB.
 */
import { describe, it, expect } from 'vitest';
import { reconcileGithubTasks } from '../../lib/tasks/reconcile-github-tasks.mjs';

describe('reconcileGithubTasks', () => {
  it('retires a renamed-repo duplicate and leaves the rest (ops#99)', () => {
    const existingKeys = [
      'github:hirobius/hds#1',
      'github:hirobius/hirobius-design-system#1',
      'github:hirobius/hds#2',
    ];
    const liveKeys = ['github:hirobius/hds#1', 'github:hirobius/hds#2'];

    expect(reconcileGithubTasks(existingKeys, liveKeys)).toEqual([
      'github:hirobius/hirobius-design-system#1',
    ]);
  });

  it('retires a key whose issue closed (stored but no longer live)', () => {
    const existingKeys = ['github:hirobius/ops#1', 'github:hirobius/ops#2'];
    const liveKeys = ['github:hirobius/ops#1'];

    expect(reconcileGithubTasks(existingKeys, liveKeys)).toEqual(['github:hirobius/ops#2']);
  });

  it('retires nothing when stored and live sets match', () => {
    const keys = ['github:hirobius/ops#1', 'github:hirobius/ops#2'];
    expect(reconcileGithubTasks(keys, keys)).toEqual([]);
  });

  it('treats non-array inputs as empty', () => {
    expect(reconcileGithubTasks(undefined, undefined)).toEqual([]);
    expect(reconcileGithubTasks(['github:hirobius/ops#1'], undefined)).toEqual([
      'github:hirobius/ops#1',
    ]);
  });
});
