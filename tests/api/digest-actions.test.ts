// @vitest-environment node
/**
 * lib/digests/actions.mjs — digest item dismiss/restore mutations (ops#78).
 * Mirrors tests/api/task-actions.test.ts's stub-`sb` pattern.
 */
import { describe, it, expect } from 'vitest';
import { applyDigestAction } from '../../lib/digests/actions.mjs';

function makeSb(opts: { updateError?: { message: string } | null } = {}) {
  const { updateError = null } = opts;
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch);
              return { error: updateError };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, updates };
}

describe('applyDigestAction', () => {
  it('dismiss sets status=dismissed and returns 200', async () => {
    const { sb, updates } = makeSb();
    expect(await applyDigestAction(sb, { key: 'k1', action: 'dismiss' })).toEqual({
      status: 200,
      body: { ok: true, status: 'dismissed' },
    });
    expect(updates[0]).toEqual({ status: 'dismissed' });
  });

  it('restore sets status=new and returns 200', async () => {
    const { sb, updates } = makeSb();
    expect(await applyDigestAction(sb, { key: 'k1', action: 'restore' })).toEqual({
      status: 200,
      body: { ok: true, status: 'new' },
    });
    expect(updates[0]).toEqual({ status: 'new' });
  });

  it('400s on an unknown action', async () => {
    const { sb } = makeSb();
    expect(await applyDigestAction(sb, { key: 'k1', action: 'frobnicate' })).toEqual({
      status: 400,
      body: { error: 'unknown action: frobnicate' },
    });
  });

  it('500s when the update errors', async () => {
    const { sb } = makeSb({ updateError: { message: 'write failed' } });
    const result = await applyDigestAction(sb, { key: 'k1', action: 'dismiss' });
    expect(result).toEqual({ status: 500, body: { error: 'write failed' } });
  });
});
