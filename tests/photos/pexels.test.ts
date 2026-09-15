// @vitest-environment node
/**
 * tests/photos/pexels.test.ts — ops#196.
 *
 * Stock imagery for previews whose lead has no business photos. Outscraper's
 * search tier returns no photo URLs (a details pass is the paid #190), so
 * without this every generated preview ships an empty hero and empty gallery.
 *
 * fetch is mocked throughout — CI and the Ralph loop never need the real key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchStockPhotos,
  tradeQuery,
  MissingPexelsKeyError,
} from '../../lib/photos/pexels.mjs';

const ORIGINAL_KEY = process.env.PEXELS_API_KEY;

function mockPexels(photos: Array<Record<string, unknown>>, status = 200) {
  const f = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ photos }),
    text: async () => 'error body',
  });
  vi.stubGlobal('fetch', f);
  return f;
}

const photo = (id: number) => ({
  id,
  alt: 'A tidy green lawn',
  photographer: 'Jane Doe',
  src: { large: `https://images.pexels.com/photos/${id}/x.jpg` },
});

beforeEach(() => {
  process.env.PEXELS_API_KEY = 'test-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.PEXELS_API_KEY;
  else process.env.PEXELS_API_KEY = ORIGINAL_KEY;
});

describe('tradeQuery', () => {
  it.each([
    ['landscaping', /landscap/i],
    ['junk-removal', /junk/i],
    ['pressure-washing', /pressure washing/i],
    ['concrete-fencing', /concrete|fenc/i],
  ])('maps the %s preset to a trade-specific query', (preset, expected) => {
    expect(tradeQuery(preset, null)).toMatch(expected);
  });

  it("falls back to the lead's own category when the preset is unknown", () => {
    expect(tradeQuery('not-a-preset', 'roof cleaning')).toMatch(/roof cleaning/i);
  });

  it('never returns an empty query', () => {
    expect(tradeQuery(null, null).trim().length).toBeGreaterThan(0);
  });
});

describe('searchStockPhotos', () => {
  it('returns normalized entries with provenance', async () => {
    mockPexels([photo(1), photo(2)]);
    const out = await searchStockPhotos({ query: 'lawn care', count: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: 1,
      source: 'pexels',
      photographer: 'Jane Doe',
    });
    expect(out[0].path).toBe('/photos/stock-pexels-1.jpg');
  });

  it('sends the key as an Authorization header', async () => {
    const f = mockPexels([photo(1)]);
    await searchStockPhotos({ query: 'lawn care', count: 1 });
    const init = f.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('test-key');
  });

  it('requests landscape orientation and caps the fetch size for the perf budget', async () => {
    const f = mockPexels([photo(1)]);
    await searchStockPhotos({ query: 'lawn care', count: 1 });
    const url = String(f.mock.calls[0][0]);
    expect(url).toMatch(/orientation=landscape/);
    expect(out1600(url)).toBe(true);
  });

  it('caps every returned url at 1600px on its longest edge', async () => {
    mockPexels([photo(1)]);
    const [p] = await searchStockPhotos({ query: 'lawn care', count: 1 });
    expect(out1600(p.url)).toBe(true);
  });

  it('writes honest stock alt text — never a claim about the client’s own work', async () => {
    mockPexels([photo(7)]);
    const [p] = await searchStockPhotos({ query: 'pressure washing driveway', count: 1 });
    expect(p.alt).toMatch(/stock photo/i);
    expect(p.alt).not.toMatch(/our |we |client/i);
  });

  it('throws MissingPexelsKeyError naming the variable AND the fix when the key is absent', async () => {
    delete process.env.PEXELS_API_KEY;
    mockPexels([photo(1)]);
    await expect(searchStockPhotos({ query: 'x', count: 1 })).rejects.toThrow(MissingPexelsKeyError);
    await expect(searchStockPhotos({ query: 'x', count: 1 })).rejects.toThrow(
      /PEXELS_API_KEY.*vercel\.com/is,
    );
  });

  it('does not call the API at all when the key is missing', async () => {
    delete process.env.PEXELS_API_KEY;
    const f = mockPexels([photo(1)]);
    await expect(searchStockPhotos({ query: 'x', count: 1 })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it('throws an actionable error naming the variable when the key is rejected', async () => {
    mockPexels([], 401);
    await expect(searchStockPhotos({ query: 'x', count: 1 })).rejects.toThrow(/PEXELS_API_KEY/);
  });

  it('returns an empty array when the API has no matches — not an error', async () => {
    mockPexels([]);
    await expect(searchStockPhotos({ query: 'nothing', count: 3 })).resolves.toEqual([]);
  });

  it('asks for exactly the count requested', async () => {
    const f = mockPexels([photo(1)]);
    await searchStockPhotos({ query: 'x', count: 5 });
    expect(String(f.mock.calls[0][0])).toMatch(/per_page=5/);
  });
});

/** Every Pexels src URL we emit must be size-capped for the Lighthouse budget. */
function out1600(url: string) {
  const u = new URL(url);
  const w = Number(u.searchParams.get('w') ?? 0);
  const h = Number(u.searchParams.get('h') ?? 0);
  return Math.max(w, h) <= 1600 && Math.max(w, h) > 0;
}
