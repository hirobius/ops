/**
 * Unit tests for scripts/check-unit-overlap.mjs's pure piece (issue #47, B.3).
 * The pure overlap detection itself is exercised in overlap.test.mjs
 * (lib/tasks/overlap.mjs::findAllOverlaps) — this just covers the
 * script-local column-missing guard, same pattern as fleet-dispatch.test.mjs
 * / fleet-watchdog.test.mjs.
 */

import { describe, it, expect } from 'vitest';
import { isMissingColumnError, MIGRATION_HINT } from '../check-unit-overlap.mjs';

describe('isMissingColumnError', () => {
  it('is false for a null/undefined error', () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });

  it('is true for PostgREST code 42703 (undefined_column)', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column tasks.touches does not exist' })).toBe(
      true,
    );
  });

  it('is true when the message matches "column ... does not exist" without the code', () => {
    expect(
      isMissingColumnError({ message: 'column "touches" of relation "tasks" does not exist' }),
    ).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });
});

describe('MIGRATION_HINT', () => {
  it('points at the lease/touches migration', () => {
    expect(MIGRATION_HINT).toBe('supabase/migrations/0009_task_lease_touches.sql');
  });
});
