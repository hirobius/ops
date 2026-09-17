// @vitest-environment node
/**
 * lib/leads/pipeline.mjs — the per-lead site state machines, tested with a stub
 * Supabase client and a stubbed agent step (no HTTP, no DB).
 *
 * The headline cases are the BUG FIX: when the result-update returns an error,
 * the row must roll back to its failure state, not stay stranded in-flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/agent/index.mjs', () => ({ runPipeline: vi.fn() }));
// Stock-photo fill (ops#196) runs inside generateLeadSite for any lead without
// photos. Mocked to "no key" so these cases stay hermetic: unmocked, the result
// would depend on whether PEXELS_API_KEY happens to be set in the environment,
// and a machine that has it set would make a live network call from a unit test.
// The class is declared INSIDE the factory: vi.mock is hoisted above top-level
// declarations, so a class defined outside is not yet initialized when it runs.
vi.mock('../../lib/photos/pexels.mjs', () => {
  class MissingPexelsKeyError extends Error {}
  return {
    searchStockPhotos: vi.fn().mockRejectedValue(new MissingPexelsKeyError('no key in tests')),
    tradeQuery: () => 'stub query',
    MissingPexelsKeyError,
  };
});

import { runPipeline } from '../../lib/agent/index.mjs';
import { generateLeadSite, recordLiveUrl, toAgentLead } from '../../lib/leads/pipeline.mjs';

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
                  lead
                    ? { data: lead, error: fetchError }
                    : { data: null, error: fetchError ?? { message: 'not found' } },
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
});

describe('toAgentLead', () => {
  // One mapping shared by production generation and the model eval's --from-db
  // mode (ops#7), so the eval scores exactly the input the agent really gets.
  it('maps a leads row to pipeline input, turning nulls into absent fields', () => {
    expect(
      toAgentLead({
        ...LEAD,
        rating: 4.5,
        review_count: 12,
        description: 'Family-owned.',
        street_address: '1 Main St',
        hours: { Monday: '9 AM–5 PM' },
        photos: ['/photos/a.jpg'],
      }),
    ).toEqual({
      name: 'Acme',
      category: 'roofing',
      city: 'Austin',
      region: 'TX',
      phone: undefined,
      email: undefined,
      website: undefined,
      rating: 4.5,
      reviewCount: 12,
      notes: 'Family-owned.',
      hours: { Monday: '9 AM–5 PM' },
      streetAddress: '1 Main St',
      photos: ['/photos/a.jpg'],
      logoUrl: undefined,
    });
  });

  it('uses the photos it is given over the row’s own', () => {
    expect(toAgentLead({ ...LEAD, photos: ['/row.jpg'] }, ['/stock.jpg']).photos).toEqual([
      '/stock.jpg',
    ]);
    expect(toAgentLead({ ...LEAD, photos: null }).photos).toBeUndefined();
  });
});

describe('generateLeadSite', () => {
  it('feeds the agent the toAgentLead mapping of the row', async () => {
    vi.mocked(runPipeline).mockResolvedValueOnce(PIPELINE_RESULT);
    const { sb } = makeSb({ lead: LEAD });
    await generateLeadSite(sb, 'lead-1');
    expect(runPipeline).toHaveBeenCalledWith(toAgentLead(LEAD));
  });

  it('404s when the lead is missing', async () => {
    const { sb } = makeSb({ lead: null });
    expect(await generateLeadSite(sb, 'nope')).toEqual({
      status: 404,
      body: { error: 'lead not found' },
    });
  });

  it('runs and scores on the happy path', async () => {
    vi.mocked(runPipeline).mockResolvedValueOnce(PIPELINE_RESULT);
    const { sb, updates } = makeSb({ lead: LEAD });
    const result = await generateLeadSite(sb, 'lead-1');
    // photosNote is part of the contract since ops#196: this LEAD has no photos
    // and the mocked Pexels reports no key, so generation proceeds with
    // placeholder imagery AND says why. Asserted exactly rather than loosened to
    // toMatchObject, so an unexpected extra field still fails the test.
    expect(result).toEqual({
      status: 200,
      body: { ok: true, score: 4.5, pass: true, photosNote: 'no key in tests' },
    });
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
    const { sb, updates } = makeSb({
      lead: LEAD,
      updateErrors: [null, { message: 'write failed' }],
    });
    const result = await generateLeadSite(sb, 'lead-1');
    expect(result).toEqual({ status: 500, body: { error: 'write failed' } });
    expect(updates.at(-1)).toEqual({ status: 'sourced' }); // not stranded in 'generating'
  });
});

describe('recordLiveUrl', () => {
  it('404s when the lead is missing', async () => {
    const { sb } = makeSb({ lead: null });
    expect(await recordLiveUrl(sb, 'nope', { liveUrl: 'https://acme.example' })).toEqual({
      status: 404,
      body: { error: 'lead not found' },
    });
  });

  it('writes live_url only and returns success', async () => {
    const { sb, updates } = makeSb({ lead: LEAD });
    const result = await recordLiveUrl(sb, 'lead-1', { liveUrl: 'https://acme.example' });
    expect(result).toEqual({ status: 200, body: { ok: true, liveUrl: 'https://acme.example' } });
    expect(updates).toEqual([{ live_url: 'https://acme.example' }]);
  });

  it('500s when the write fails', async () => {
    const { sb } = makeSb({ lead: LEAD, updateErrors: [{ message: 'db down' }] });
    const result = await recordLiveUrl(sb, 'lead-1', { liveUrl: 'https://acme.example' });
    expect(result).toEqual({ status: 500, body: { error: 'db down' } });
  });
});
