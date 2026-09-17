// @vitest-environment node
/**
 * lib/tasks/needs-adrian-pager.mjs — the pure before/after `needs-adrian`
 * transition diff. No network, no DB: exercised directly against plain
 * `{key, tags}` shapes.
 */
import { describe, it, expect } from 'vitest';
import { detectNewlyNeedsAdrian } from '../../lib/tasks/needs-adrian-pager.mjs';

describe('detectNewlyNeedsAdrian', () => {
  it('pages a brand-new task imported already carrying needs-adrian', () => {
    const imported = [{ key: 'github:hirobius/ops#1', tags: ['needs-adrian'], title: 'A' }];
    expect(detectNewlyNeedsAdrian([], imported)).toEqual(imported);
  });

  it('pages an existing task whose tags just gained needs-adrian', () => {
    const existing = [{ key: 'github:hirobius/ops#1', tags: ['ralph-wip'] }];
    const imported = [
      { key: 'github:hirobius/ops#1', tags: ['ralph-wip', 'needs-adrian'], title: 'A' },
    ];
    expect(detectNewlyNeedsAdrian(existing, imported)).toEqual(imported);
  });

  it('does not re-page a task that already carried needs-adrian (de-dup)', () => {
    const existing = [{ key: 'github:hirobius/ops#1', tags: ['needs-adrian'] }];
    const imported = [{ key: 'github:hirobius/ops#1', tags: ['needs-adrian'], title: 'A' }];
    expect(detectNewlyNeedsAdrian(existing, imported)).toEqual([]);
  });

  it('does not page a task with no needs-adrian tag', () => {
    const existing = [{ key: 'github:hirobius/ops#1', tags: [] }];
    const imported = [{ key: 'github:hirobius/ops#1', tags: ['ralph-ready'], title: 'A' }];
    expect(detectNewlyNeedsAdrian(existing, imported)).toEqual([]);
  });

  it('re-pages once needs-adrian is cleared then re-applied', () => {
    const existing = [{ key: 'github:hirobius/ops#1', tags: [] }];
    const imported = [{ key: 'github:hirobius/ops#1', tags: ['needs-adrian'], title: 'A' }];
    expect(detectNewlyNeedsAdrian(existing, imported)).toEqual(imported);
  });

  it('handles multiple rows, paging only the ones that transitioned', () => {
    const existing = [
      { key: 'github:hirobius/ops#1', tags: ['needs-adrian'] },
      { key: 'github:hirobius/ops#2', tags: [] },
    ];
    const imported = [
      { key: 'github:hirobius/ops#1', tags: ['needs-adrian'], title: 'A' },
      { key: 'github:hirobius/ops#2', tags: ['needs-adrian'], title: 'B' },
      { key: 'github:hirobius/ops#3', tags: ['needs-adrian'], title: 'C' },
    ];
    expect(detectNewlyNeedsAdrian(existing, imported)).toEqual([imported[1], imported[2]]);
  });

  it('treats missing/undefined inputs as empty', () => {
    expect(detectNewlyNeedsAdrian(undefined, undefined)).toEqual([]);
    expect(
      detectNewlyNeedsAdrian(null, [{ key: 'k', tags: ['needs-adrian'], title: 'A' }]),
    ).toEqual([{ key: 'k', tags: ['needs-adrian'], title: 'A' }]);
  });
});
