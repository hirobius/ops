// @vitest-environment node
/**
 * lib/portal-feedback.mjs — client-portal feedback intake (migration 0012).
 * Mirrors tests/api/digest-actions.test.ts's stub-`sb` pattern.
 */
import { describe, it, expect } from 'vitest';
import { submitFeedback, listFeedback } from '../../lib/portal-feedback.mjs';

function makeSb(opts: { insertError?: { message: string } | null } = {}) {
  const { insertError = null } = opts;
  const inserts: Array<Record<string, unknown>> = [];
  const sb = {
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, ...row });
          return { error: insertError };
        },
      };
    },
  };
  return { sb: sb as never, inserts };
}

describe('submitFeedback', () => {
  it('inserts a trimmed row into client_feedback and returns 200', async () => {
    const { sb, inserts } = makeSb();
    const result = await submitFeedback(sb, {
      slug: 'monroe-st',
      message: '  Please update our hours to 8-6.  ',
      contact: 'owner@example.com',
    });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(inserts[0]).toEqual({
      table: 'client_feedback',
      slug: 'monroe-st',
      message: 'Please update our hours to 8-6.',
      contact: 'owner@example.com',
    });
  });

  it('omits contact when not provided', async () => {
    const { sb, inserts } = makeSb();
    await submitFeedback(sb, { slug: 'monroe-st', message: 'hi' });
    expect(inserts[0]).toEqual({ table: 'client_feedback', slug: 'monroe-st', message: 'hi', contact: null });
  });

  it('400s on an empty/whitespace message without touching the db', async () => {
    const { sb, inserts } = makeSb();
    const result = await submitFeedback(sb, { slug: 'monroe-st', message: '   ' });
    expect(result.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('400s on a missing slug', async () => {
    const { sb } = makeSb();
    const result = await submitFeedback(sb, { slug: '', message: 'hello' });
    expect(result.status).toBe(400);
  });

  it('400s on an over-length message (> 5000 chars)', async () => {
    const { sb, inserts } = makeSb();
    const result = await submitFeedback(sb, { slug: 'monroe-st', message: 'x'.repeat(5001) });
    expect(result.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('500s with the db message when the insert errors', async () => {
    const { sb } = makeSb({ insertError: { message: 'insert failed' } });
    const result = await submitFeedback(sb, { slug: 'monroe-st', message: 'hello' });
    expect(result).toEqual({ status: 500, body: { error: 'insert failed' } });
  });
});

describe('listFeedback', () => {
  it('selects newest-first from client_feedback with the given limit', async () => {
    const calls: Record<string, unknown>[] = [];
    const rows = [{ slug: 'monroe-st', message: 'hi' }];
    const sb = {
      from(table: string) {
        return {
          select(cols: string) {
            return {
              order(col: string, opts: { ascending: boolean }) {
                return {
                  limit: async (n: number) => {
                    calls.push({ table, cols, col, ascending: opts.ascending, limit: n });
                    return { data: rows, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
    const { data, error } = await listFeedback(sb as never, { limit: 50 });
    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(calls[0]).toEqual({
      table: 'client_feedback',
      cols: '*',
      col: 'created_at',
      ascending: false,
      limit: 50,
    });
  });
});
