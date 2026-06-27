// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { opsApi } from './opsApi';

afterEach(() => vi.restoreAllMocks());

describe('opsApi.post', () => {
  it('JSON-encodes a body with the content-type header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await opsApi.post('/api/x', { a: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it('sends a bare POST (no headers/body) when there is no body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await opsApi.post('/api/y');
    expect(fetchMock).toHaveBeenCalledWith('/api/y', { method: 'POST' });
  });

  it('returns the raw Response for the caller to parse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const res = await opsApi.post('/api/z', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
