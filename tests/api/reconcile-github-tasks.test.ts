// @vitest-environment node
/**
 * lib/tasks/reconcile-github-tasks.mjs — the importer's prune-decision helpers.
 * Pure data-in/data-out, same style as tests/api/import-issues.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { reconcileGithubTasks, reconcileGuard } from '../../lib/tasks/reconcile-github-tasks.mjs';

describe('reconcileGithubTasks', () => {
  it('retires a renamed-repo stray and a closed-issue key, leaves the rest', () => {
    const existing = [
      'github:hirobius/hds#1',
      'github:hirobius/hirobius-design-system#1',
      'github:hirobius/hds#2',
    ];
    const live = ['github:hirobius/hds#1', 'github:hirobius/hds#2'];
    expect(reconcileGithubTasks(existing, live)).toEqual([
      'github:hirobius/hirobius-design-system#1',
    ]);
  });

  it('retires a key present stored but absent live (issue closed)', () => {
    expect(
      reconcileGithubTasks(
        ['github:hirobius/ops#1', 'github:hirobius/ops#2'],
        ['github:hirobius/ops#1'],
      ),
    ).toEqual(['github:hirobius/ops#2']);
  });

  it('retires nothing when stored and live match exactly', () => {
    const keys = ['github:hirobius/ops#1', 'github:hirobius/ops#2'];
    expect(reconcileGithubTasks(keys, keys)).toEqual([]);
  });

  it('treats missing inputs as empty', () => {
    expect(reconcileGithubTasks(undefined, undefined)).toEqual([]);
    expect(reconcileGithubTasks(['github:hirobius/ops#1'], undefined)).toEqual([
      'github:hirobius/ops#1',
    ]);
  });
});

describe('reconcileGuard', () => {
  it('allows a small, proportionate retire batch', () => {
    const existing = [
      'github:hirobius/hds#1',
      'github:hirobius/hirobius-design-system#1',
      'github:hirobius/hds#2',
    ];
    const live = ['github:hirobius/hds#1', 'github:hirobius/hds#2'];
    expect(reconcileGuard(existing, live)).toEqual({ ok: true });
  });

  it('blocks when the live set is empty but stored keys exist (degenerate fetch)', () => {
    expect(reconcileGuard(['github:hirobius/ops#1'], [])).toEqual({
      ok: false,
      reason: 'empty-live-set',
    });
  });

  it('allows an empty live set when there are no stored keys either (first import)', () => {
    expect(reconcileGuard([], [])).toEqual({ ok: true });
  });

  it('blocks a mass-retire — >=5 keys and over half of stored', () => {
    const existing = Array.from({ length: 8 }, (_, i) => `github:hirobius/ops#${i}`);
    const live = existing.slice(0, 2); // 6 of 8 would retire — over half, over the floor
    expect(reconcileGuard(existing, live)).toEqual({ ok: false, reason: 'mass-retire' });
  });

  it('allows retiring more than half of stored when the batch is below the floor count', () => {
    const existing = ['github:hirobius/ops#1', 'github:hirobius/ops#2', 'github:hirobius/ops#3'];
    const live = ['github:hirobius/ops#1']; // retires 2 of 3 (>50%) but below the 5-key floor
    expect(reconcileGuard(existing, live)).toEqual({ ok: true });
  });

  it('allows a >=5-key retire batch that is not a majority of stored', () => {
    const existing = Array.from({ length: 20 }, (_, i) => `github:hirobius/ops#${i}`);
    const live = existing.slice(0, 15); // 5 of 20 retire — at the floor, not over half
    expect(reconcileGuard(existing, live)).toEqual({ ok: true });
  });
});
