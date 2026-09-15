// @vitest-environment node
/**
 * tests/photos/pipeline-stock-photos.test.ts — ops#196.
 *
 * generateLeadSite fills imagery-less leads with stock photos before generation,
 * and persists the manifest so the render hand-off can emit downloads for it.
 *
 * Three paths matter and all three are tested: no business photos (fetch),
 * business photos present (never fetch — they always win), and no API key
 * (degrade to today's placeholder behaviour, with an actionable message).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchStockPhotos = vi.fn();
class MissingPexelsKeyError extends Error {}
vi.mock('../../lib/photos/pexels.mjs', () => ({
  searchStockPhotos: (...a: unknown[]) => searchStockPhotos(...a),
  tradeQuery: () => 'landscaped garden lawn care',
  MissingPexelsKeyError,
}));

const runPipeline = vi.fn();
vi.mock('../../lib/agent/index.mjs', () => ({ runPipeline: (...a: unknown[]) => runPipeline(...a) }));

const { generateLeadSite } = await import('../../lib/leads/pipeline.mjs');

const stock = (id: number) => ({
  id,
  url: `https://images.pexels.com/photos/${id}/x.jpg?w=1600`,
  path: `/photos/stock-pexels-${id}.jpg`,
  alt: 'A tidy green lawn — stock photo',
  source: 'pexels',
  photographer: 'Jane Doe',
});

function makeSb(lead: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from() {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: lead, error: null }) }) }),
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { sb, updates };
}

const LEAD = {
  id: 'l1',
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  photos: [],
};

beforeEach(() => {
  searchStockPhotos.mockReset();
  runPipeline.mockReset();
  runPipeline.mockResolvedValue({
    config: { slug: 'violet-verge' },
    judge: { overall: 4, pass: true, notes: '' },
    loop: { iterations: 1 },
  });
});

describe('generateLeadSite stock-photo fill', () => {
  it('fetches stock photos for an imagery-less lead and passes them to the agent', async () => {
    searchStockPhotos.mockResolvedValue([1, 2, 3, 4, 5].map(stock));
    const { sb } = makeSb(LEAD);

    await generateLeadSite(sb as never, 'l1');

    expect(searchStockPhotos).toHaveBeenCalledTimes(1);
    expect(searchStockPhotos.mock.calls[0][0].count).toBe(5);
    expect(runPipeline.mock.calls[0][0].photos).toHaveLength(5);
  });

  it('persists the manifest with provenance so render can download them', async () => {
    searchStockPhotos.mockResolvedValue([1, 2].map(stock));
    const { sb, updates } = makeSb(LEAD);

    await generateLeadSite(sb as never, 'l1');

    const written = updates.find((u) => 'photos' in u);
    expect(written?.photos).toHaveLength(2);
    expect((written?.photos as Array<Record<string, unknown>>)[0]).toMatchObject({
      source: 'pexels',
      photographer: 'Jane Doe',
    });
  });

  it('never calls Pexels when the lead already has business photos', async () => {
    const { sb } = makeSb({ ...LEAD, photos: ['https://biz.example/real.jpg'] });

    await generateLeadSite(sb as never, 'l1');

    expect(searchStockPhotos).not.toHaveBeenCalled();
  });

  it('degrades to placeholder behaviour when the key is missing, and says so', async () => {
    searchStockPhotos.mockRejectedValue(new MissingPexelsKeyError('PEXELS_API_KEY is not set'));
    const { sb } = makeSb(LEAD);

    const res = await generateLeadSite(sb as never, 'l1');

    expect(res.status).toBe(200);
    expect(runPipeline).toHaveBeenCalled();
    expect(JSON.stringify(res.body)).toMatch(/PEXELS_API_KEY/);
  });

  it('does not fail generation when Pexels errors for any other reason', async () => {
    searchStockPhotos.mockRejectedValue(new Error('Pexels HTTP 500'));
    const { sb } = makeSb(LEAD);

    const res = await generateLeadSite(sb as never, 'l1');

    expect(res.status).toBe(200);
    expect(runPipeline).toHaveBeenCalled();
  });
});
