// @vitest-environment node
/**
 * lib/leads/pipeline.mjs — the per-lead site state machines, tested with a stub
 * Supabase client and stubbed agent/duda steps (no HTTP, no DB).
 *
 * The headline cases are the BUG FIX: when the result-update returns an error,
 * the row must roll back to its failure state, not stay stranded in-flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/agent/index.mjs', () => ({ runPipeline: vi.fn() }));
vi.mock('../../lib/duda/index.mjs', () => ({ buildSite: vi.fn(), publishSite: vi.fn() }));

import { runPipeline } from '../../lib/agent/index.mjs';
import { buildSite, publishSite } from '../../lib/duda/index.mjs';
import { generateLeadSite, buildLeadSite, publishLeadSite } from '../../lib/leads/pipeline.mjs';

/**
 * A recording Supabase stub. `select().eq().single()` resolves the fetch;
 * `update(patch).eq()` records the patch and resolves the next queued error.
 */
function makeSb(opts: {
  lead: Record<string, unknown> | null;
  fetchError?: unknown;
  updateErrors?: Array<{ message: string } | null>;
}) {
  const { lead, fetchError = null, updateErrors = [] } = opts;
  const updates: Array<Record<string, unknown>> = [];
  let i = 0;
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  lead ? { data: lead, error: fetchError } : { data: null, error: fetchError ?? { message: 'not found' } },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch);
              return { error: updateErrors[i++] ?? null };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, updates };
}

const LEAD = {
  id: 'lead-1',
  name: 'Acme',
  city: 'Austin',
  region: 'TX',
  category: 'roofing',
  phone: null,
  website: null,
  email: null,
  logo_url: null,
  social: null,
  description: null,
};

// Shape of the vendored clients pipeline: judge.overall is 1–5; no enrichment
// (contact fields arrive at sourcing from Outscraper).
const PIPELINE_RESULT = {
  config: { theme: 'x' },
  judge: { overall: 4.5, pass: true, notes: 'good' },
  loop: { iterations: 2 },
};

beforeEach(() => {
  vi.mocked(runPipeline).mockReset();
  vi.mocked(buildSite).mockReset();
  vi.mocked(publishSite).mockReset();
});

describe('generateLeadSite', () => {
  it('404s when the lead is missing', async () => {
    const { sb } = makeSb({ lead: null });
    expect(await generateLeadSite(sb, 'nope')).toEqual({ status: 404, body: { error: 'lead not found' } });
  });

  it('runs and scores on the happy path', async () => {
    vi.mocked(runPipeline).mockResolvedValueOnce(PIPELINE_RESULT);
    const { sb, updates } = makeSb({ lead: LEAD });
    const result = await generateLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 200, body: { ok: true, score: 4.5, pass: true } });
    expect(updates[0]).toEqual({ status: 'generating' });
    // judge 1–5 is persisted on the board's 0–100 scale (×20).
    expect(updates[1]).toMatchObject({ status: 'scored', eval_score: 90 });
  });

  it('rolls back to sourced when the pipeline throws', async () => {
    vi.mocked(runPipeline).mockRejectedValueOnce(new Error('agent boom'));
    const { sb, updates } = makeSb({ lead: LEAD });
    const result = await generateLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 500, body: { error: 'agent boom' } });
    expect(updates.at(-1)).toEqual({ status: 'sourced' });
  });

  it('BUGFIX: rolls back to sourced when the scored-update itself errors', async () => {
    vi.mocked(runPipeline).mockResolvedValueOnce(PIPELINE_RESULT);
    // 1st update ('generating') ok, 2nd ('scored') errors → must roll back.
    const { sb, updates } = makeSb({ lead: LEAD, updateErrors: [null, { message: 'write failed' }] });
    const result = await generateLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 500, body: { error: 'write failed' } });
    expect(updates.at(-1)).toEqual({ status: 'sourced' }); // not stranded in 'generating'
  });
});

describe('buildLeadSite', () => {
  it('builds on the happy path', async () => {
    vi.mocked(buildSite).mockResolvedValueOnce({ duda_site_name: 's1', preview_url: 'http://p', editor_url: 'http://e' });
    const { sb, updates } = makeSb({ lead: LEAD });
    const result = await buildLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 200, body: { ok: true, preview_url: 'http://p' } });
    expect(updates[0]).toEqual({ site_status: 'building' });
    expect(updates[1]).toMatchObject({ site_status: 'built', duda_site_name: 's1' });
  });

  it('BUGFIX: rolls to build_failed when the built-update errors', async () => {
    vi.mocked(buildSite).mockResolvedValueOnce({ duda_site_name: 's1', preview_url: 'http://p', editor_url: 'http://e' });
    const { sb, updates } = makeSb({ lead: LEAD, updateErrors: [null, { message: 'write failed' }] });
    const result = await buildLeadSite(sb, 'lead-1');
    expect(result.status).toBe(500);
    expect(updates.at(-1)).toEqual({ site_status: 'build_failed' });
  });
});

describe('publishLeadSite', () => {
  it('409s when there is no built site', async () => {
    const { sb } = makeSb({ lead: { ...LEAD, duda_site_name: null } });
    const result = await publishLeadSite(sb, 'lead-1');
    expect(result).toMatchObject({ status: 409, body: { code: 'NO_SITE' } });
  });

  it('publishes on the happy path', async () => {
    vi.mocked(publishSite).mockResolvedValueOnce({ live_url: 'http://live' });
    const { sb, updates } = makeSb({ lead: { ...LEAD, duda_site_name: 's1' } });
    const result = await publishLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 200, body: { ok: true, live_url: 'http://live' } });
    expect(updates[0]).toEqual({ site_status: 'publishing' });
  });

  it('BUGFIX: rolls to publish_failed when the published-update errors', async () => {
    vi.mocked(publishSite).mockResolvedValueOnce({ live_url: 'http://live' });
    const { sb, updates } = makeSb({ lead: { ...LEAD, duda_site_name: 's1' }, updateErrors: [null, { message: 'write failed' }] });
    const result = await publishLeadSite(sb, 'lead-1');
    expect(result.status).toBe(500);
    expect(updates.at(-1)).toEqual({ site_status: 'publish_failed' });
  });
});
