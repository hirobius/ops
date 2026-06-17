/**
 * Tests for skills.ts — `runSkill` request shape.
 *
 * Covers (Refs: t_554cd532 / dashbd-skillsbar-input-shell):
 *   - calls POST /api/skills/:id
 *   - omits body when no input is provided (back-compat)
 *   - sends JSON body { input } and Content-Type when input is provided
 *   - surfaces the parsed JSON response shape
 *   - returns { ok: false, error } on network failure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runSkill } from './skills';

type FetchArgs = { url: string; init: RequestInit };

function captureFetch(response: unknown, ok = true): FetchArgs[] {
  const calls: FetchArgs[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(response),
      } as Response);
    }),
  );
  return calls;
}

describe('runSkill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/skills/:id with no body when input is omitted', async () => {
    const calls = captureFetch({ ok: true, exitCode: 0 });
    await runSkill('strength');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/skills/strength');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('POSTs JSON {input} with Content-Type when input is provided', async () => {
    const calls = captureFetch({ ok: true, exitCode: 0 });
    await runSkill('page-clone', 'https://example.com');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/skills/page-clone');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify({ input: 'https://example.com' }));
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns the parsed JSON response on success', async () => {
    captureFetch({ ok: true, exitCode: 0, stdout: 'hi', durationMs: 12 });
    const r = await runSkill('strength');
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('hi');
    expect(r.durationMs).toBe(12);
  });

  it('returns { ok: false, error } when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );
    const r = await runSkill('strength');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('network down');
  });

  it('does NOT send a body when input is the empty string (treated as not-provided)', async () => {
    const calls = captureFetch({ ok: true });
    await runSkill('page-clone', '');
    expect(calls[0].init.body).toBeUndefined();
  });
});
