// @vitest-environment node
/**
 * api/lead-action.ts — the `record_live_url` action (ops#44).
 *
 * The URL validation and action routing live in the dispatcher's switch
 * statement, not in lib/leads/pipeline, so this exercises leadActionHandler
 * directly (bypassing the withOpsHandler auth wrapper, same as leadsHandler in
 * tests/api/ops-handler.test.ts) with a stub Supabase client — no network.
 *
 * The headline case is the no-side-effects assertion the DoD calls for:
 * recording live_url must not touch lifecycle, preview_url, contacted_at, or
 * any pitch field. Proven by reading the row back after the write, not by
 * inspecting only the patch shape.
 */
import { describe, it, expect } from 'vitest';
import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';

import { leadActionHandler } from '../../api/lead-action';

function makeReq(body: Record<string, unknown>): VercelRequest {
  return { body } as VercelRequest;
}

/** A stub whose `update` merges into a live row, so a caller can read it back. */
function makeSb(row: Record<string, unknown> | null) {
  let current = row ? { ...row } : null;
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  current
                    ? { data: { ...current }, error: null }
                    : { data: null, error: { message: 'not found' } },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch);
              if (current) current = { ...current, ...patch };
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { sb: sb as unknown as SupabaseClient, updates, rowAfter: () => current };
}

describe('record_live_url action', () => {
  it('stamps live_url on a valid call and returns success', async () => {
    const { sb, updates } = makeSb({ id: 'l1', live_url: null });
    const result = await leadActionHandler(
      sb,
      makeReq({ leadId: 'l1', action: 'record_live_url', liveUrl: 'https://acme.example' }),
    );
    expect(result).toEqual({ status: 200, body: { ok: true, liveUrl: 'https://acme.example' } });
    expect(updates).toEqual([{ live_url: 'https://acme.example' }]);
  });

  it('400s on a non-http(s) liveUrl, naming the field', async () => {
    const { sb, updates } = makeSb({ id: 'l1' });
    const result = await leadActionHandler(
      sb,
      makeReq({ leadId: 'l1', action: 'record_live_url', liveUrl: 'not-a-url' }),
    );
    expect(result).toEqual({ status: 400, body: { error: 'liveUrl must be an http(s) URL' } });
    expect(updates).toHaveLength(0);
  });

  it('400s when liveUrl is missing', async () => {
    const { sb, updates } = makeSb({ id: 'l1' });
    const result = await leadActionHandler(
      sb,
      makeReq({ leadId: 'l1', action: 'record_live_url' }),
    );
    expect(result.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('404s for an unknown leadId', async () => {
    const { sb } = makeSb(null);
    const result = await leadActionHandler(
      sb,
      makeReq({ leadId: 'nope', action: 'record_live_url', liveUrl: 'https://acme.example' }),
    );
    expect(result).toEqual({ status: 404, body: { error: 'lead not found' } });
  });

  it('leaves lifecycle, preview_url, contacted_at and pitch fields untouched — asserted, not assumed', async () => {
    const before = {
      id: 'l1',
      status: 'rendered',
      preview_url: 'https://preview.vercel.app/acme',
      live_url: null,
      contacted_at: '2026-08-01T00:00:00Z',
      outreach_status: 'sent',
      assigned_to: 'adrian',
      next_action_at: '2026-09-01T00:00:00Z',
      do_not_contact: false,
    };
    const { sb, rowAfter } = makeSb(before);
    const result = await leadActionHandler(
      sb,
      makeReq({ leadId: 'l1', action: 'record_live_url', liveUrl: 'https://acme.example' }),
    );
    expect(result.status).toBe(200);
    expect(rowAfter()).toEqual({ ...before, live_url: 'https://acme.example' });
  });
});
