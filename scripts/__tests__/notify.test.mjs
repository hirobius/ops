import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  notifyEvent,
  readEvents,
  validateEventEntry,
  postToDiscord,
  EVENTS_PATH,
  EVENT_KINDS,
} from '../../lib/ops/notify.mjs';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'notify-test-'));
  return join(dir, 'events.jsonl');
}

describe('EVENTS_PATH', () => {
  it('points at docs/ops/events.jsonl', () => {
    expect(EVENTS_PATH.endsWith(join('docs', 'ops', 'events.jsonl'))).toBe(true);
  });
});

describe('validateEventEntry', () => {
  it('passes for a complete entry', () => {
    expect(() =>
      validateEventEntry({ ts: '2026-07-08T00:00:00Z', kind: 'completed', title: 'ok' }),
    ).not.toThrow();
  });

  it('throws naming every missing required field', () => {
    expect(() => validateEventEntry({ ts: '2026-07-08T00:00:00Z' })).toThrow(
      /kind|title/,
    );
  });

  it('throws for a non-object entry', () => {
    expect(() => validateEventEntry(null)).toThrow();
    expect(() => validateEventEntry('nope')).toThrow();
  });

  it('throws when a required field is an empty string', () => {
    expect(() =>
      validateEventEntry({ ts: '', kind: 'completed', title: 'ok' }),
    ).toThrow(/ts/);
  });

  it('throws for an unrecognized kind', () => {
    expect(() =>
      validateEventEntry({ ts: '2026-07-08T00:00:00Z', kind: 'bogus', title: 'ok' }),
    ).toThrow(/unrecognized kind/);
  });

  it('accepts every documented kind', () => {
    for (const kind of EVENT_KINDS) {
      expect(() =>
        validateEventEntry({ ts: '2026-07-08T00:00:00Z', kind, title: 'ok' }),
      ).not.toThrow();
    }
  });
});

describe('postToDiscord', () => {
  it('fails soft with a named-fix reason when no webhook is configured', async () => {
    const result = await postToDiscord('hello', { webhookUrl: undefined, fetch: vi.fn() });
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/DISCORD_WEBHOOK_URL/);
  });

  it('sends when the stub fetch resolves ok', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true });
    const result = await postToDiscord('hello', {
      webhookUrl: 'https://discord.example/webhook',
      fetch: fetchStub,
    });
    expect(result).toEqual({ sent: true });
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe('https://discord.example/webhook');
    expect(JSON.parse(init.body)).toEqual({ content: 'hello' });
  });

  it('fails soft when the response is not ok', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });
    const result = await postToDiscord('hello', {
      webhookUrl: 'https://discord.example/webhook',
      fetch: fetchStub,
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/Discord 500/);
  });

  it('fails soft (never throws) when fetch itself throws', async () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await postToDiscord('hello', {
      webhookUrl: 'https://discord.example/webhook',
      fetch: fetchStub,
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/network down/);
  });
});

describe('notifyEvent', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('appends one JSON line with only the recognized fields', async () => {
    path = tmpPath();
    const { appended, discord } = await notifyEvent(
      {
        ts: '2026-07-08T10:00:00Z',
        kind: 'completed',
        title: 'did a thing',
        task: '#41',
        bogus: 'dropped',
      },
      { path, fetch: vi.fn() },
    );
    expect(appended).toEqual({
      ts: '2026-07-08T10:00:00Z',
      kind: 'completed',
      title: 'did a thing',
      task: '#41',
    });
    expect(discord.sent).toBe(false); // no webhookUrl passed
    const raw = readFileSync(path, 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toEqual(appended);
  });

  it('creates the parent directory if missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'notify-test-'));
    path = join(dir, 'nested', 'deeper', 'events.jsonl');
    await notifyEvent(
      { ts: '2026-07-08T10:00:00Z', kind: 'blocked', title: 'nothing to do' },
      { path, fetch: vi.fn() },
    );
    expect(existsSync(path)).toBe(true);
  });

  it('rejects an entry missing a required field before writing anything', async () => {
    path = tmpPath();
    await expect(
      notifyEvent({ kind: 'completed', title: 'x' }, { path, fetch: vi.fn() }),
    ).rejects.toThrow();
    expect(existsSync(path)).toBe(false);
  });

  it('fans out to Discord via the injected fetch when a webhook is configured', async () => {
    path = tmpPath();
    const fetchStub = vi.fn().mockResolvedValue({ ok: true });
    const { discord } = await notifyEvent(
      { ts: '2026-07-08T10:00:00Z', kind: 'deploy_error', title: 'broke' },
      { path, webhookUrl: 'https://discord.example/webhook', fetch: fetchStub },
    );
    expect(discord).toEqual({ sent: true });
    expect(fetchStub).toHaveBeenCalledOnce();
    const [, init] = fetchStub.mock.calls[0];
    expect(JSON.parse(init.body).content).toMatch(/broke/);
  });

  it('is fail-soft: append still succeeds even when the webhook fetch throws', async () => {
    path = tmpPath();
    const fetchStub = vi.fn().mockRejectedValue(new Error('boom'));
    const { appended, discord } = await notifyEvent(
      { ts: '2026-07-08T10:00:00Z', kind: 'approval_waiting', title: 'needs a look' },
      { path, webhookUrl: 'https://discord.example/webhook', fetch: fetchStub },
    );
    expect(appended.title).toBe('needs a look');
    expect(discord.sent).toBe(false);
    expect(discord.reason).toMatch(/boom/);
    expect(existsSync(path)).toBe(true);
  });
});

describe('readEvents', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('returns [] when the file does not exist', () => {
    path = tmpPath();
    expect(readEvents(undefined, { path })).toEqual([]);
  });

  it('returns entries newest-first by ts', async () => {
    path = tmpPath();
    await notifyEvent(
      { ts: '2026-07-08T09:00:00Z', kind: 'completed', title: 'first' },
      { path, fetch: vi.fn() },
    );
    await notifyEvent(
      { ts: '2026-07-08T11:00:00Z', kind: 'completed', title: 'third' },
      { path, fetch: vi.fn() },
    );
    await notifyEvent(
      { ts: '2026-07-08T10:00:00Z', kind: 'completed', title: 'second' },
      { path, fetch: vi.fn() },
    );
    const events = readEvents(undefined, { path });
    expect(events.map((e) => e.title)).toEqual(['third', 'second', 'first']);
  });

  it('respects the limit argument', async () => {
    path = tmpPath();
    for (let i = 0; i < 5; i += 1) {
      await notifyEvent(
        { ts: `2026-07-08T0${i}:00:00Z`, kind: 'completed', title: `n${i}` },
        { path, fetch: vi.fn() },
      );
    }
    expect(readEvents(2, { path })).toHaveLength(2);
    expect(readEvents(2, { path }).map((e) => e.title)).toEqual(['n4', 'n3']);
  });

  it('skips malformed lines instead of throwing', async () => {
    path = tmpPath();
    await notifyEvent(
      { ts: '2026-07-08T09:00:00Z', kind: 'completed', title: 'good' },
      { path, fetch: vi.fn() },
    );
    appendFileSync(path, 'not json\n');
    const events = readEvents(undefined, { path });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('good');
  });
});
