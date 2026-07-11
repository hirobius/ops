/**
 * lib/tasks/work-state.mjs — one derived work-state per task (ops#135).
 *
 * One case per precedence rule (in order) plus the ties the issue calls out
 * explicitly: a higher-precedence field always wins over a lower one, even
 * when both are present on the same row.
 */
import { describe, it, expect } from 'vitest';
import { deriveWorkState, WORK_STATE_TONE } from '../../lib/tasks/work-state.mjs';

function task(overrides: Record<string, unknown> = {}) {
  return {
    status: 'open',
    completed_at: null,
    tags: null,
    dispatch_status: null,
    claimed_by: null,
    dispatch_url: null,
    ...overrides,
  };
}

describe('deriveWorkState — precedence rules', () => {
  it('1. status=done → done', () => {
    expect(deriveWorkState(task({ status: 'done' }))).toBe('done');
  });

  it('1. completed_at set → done', () => {
    expect(deriveWorkState(task({ completed_at: '2026-07-11T00:00:00Z' }))).toBe('done');
  });

  it('2. tags include needs-adrian → needs-adrian', () => {
    expect(deriveWorkState(task({ tags: ['needs-adrian'] }))).toBe('needs-adrian');
  });

  it('3. tags include ralph-parked → parked', () => {
    expect(deriveWorkState(task({ tags: ['ralph-parked'] }))).toBe('parked');
  });

  it('4. status=blocked → blocked', () => {
    expect(deriveWorkState(task({ status: 'blocked' }))).toBe('blocked');
  });

  it('4. dispatch_status=failed → blocked', () => {
    expect(deriveWorkState(task({ dispatch_status: 'failed' }))).toBe('blocked');
  });

  it('5. tags include ralph-wip → wip', () => {
    expect(deriveWorkState(task({ tags: ['ralph-wip'] }))).toBe('wip');
  });

  it('6. dispatch_status=dispatched → dispatched', () => {
    expect(deriveWorkState(task({ dispatch_status: 'dispatched' }))).toBe('dispatched');
  });

  it('6. claimed_by=claude AND dispatch_url set → dispatched', () => {
    expect(
      deriveWorkState(
        task({ claimed_by: 'claude', dispatch_url: 'https://github.com/hirobius/ops/issues/1' }),
      ),
    ).toBe('dispatched');
  });

  it('6. claimed_by=claude WITHOUT dispatch_url does not count as dispatched', () => {
    expect(deriveWorkState(task({ claimed_by: 'claude' }))).toBe('backlog');
  });

  it('7. dispatch_status=queued → queued', () => {
    expect(deriveWorkState(task({ dispatch_status: 'queued' }))).toBe('queued');
  });

  it('8. tags include ralph-ready → ready', () => {
    expect(deriveWorkState(task({ tags: ['ralph-ready'] }))).toBe('ready');
  });

  it('9. no matching field → backlog', () => {
    expect(deriveWorkState(task())).toBe('backlog');
  });
});

describe('deriveWorkState — ties (higher precedence wins)', () => {
  it('ralph-parked tag + status=blocked → parked (rule 3 beats rule 4)', () => {
    expect(deriveWorkState(task({ status: 'blocked', tags: ['ralph-parked'] }))).toBe('parked');
  });

  it('completed_at + ralph-wip tag → done (rule 1 beats rule 5)', () => {
    expect(
      deriveWorkState(task({ completed_at: '2026-07-11T00:00:00Z', tags: ['ralph-wip'] })),
    ).toBe('done');
  });

  it('needs-adrian tag + status=done → done (rule 1 beats rule 2)', () => {
    expect(deriveWorkState(task({ status: 'done', tags: ['needs-adrian'] }))).toBe('done');
  });

  it('needs-adrian tag + ralph-parked tag → needs-adrian (rule 2 beats rule 3)', () => {
    expect(deriveWorkState(task({ tags: ['needs-adrian', 'ralph-parked'] }))).toBe('needs-adrian');
  });

  it('ralph-wip tag + dispatch_status=queued → wip (rule 5 beats rule 7)', () => {
    expect(deriveWorkState(task({ tags: ['ralph-wip'], dispatch_status: 'queued' }))).toBe('wip');
  });

  it('dispatch_status=dispatched + ralph-ready tag → dispatched (rule 6 beats rule 8)', () => {
    expect(deriveWorkState(task({ dispatch_status: 'dispatched', tags: ['ralph-ready'] }))).toBe(
      'dispatched',
    );
  });
});

describe('WORK_STATE_TONE', () => {
  it('has a tone for every phase deriveWorkState can return', () => {
    const phases = [
      'done',
      'needs-adrian',
      'parked',
      'blocked',
      'wip',
      'dispatched',
      'queued',
      'ready',
      'backlog',
    ];
    for (const phase of phases) {
      expect(WORK_STATE_TONE[phase]).toBeTruthy();
    }
  });
});
