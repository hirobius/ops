import { describe, it, expect } from 'vitest';
import { parseLog, trimOldEntries, computeStats } from '../lib/firing-stats.mjs';

describe('parseLog', () => {
  it('parses one JSON object per line, skipping blank and malformed lines', () => {
    const raw = [
      '{"gate":"a","ts":"2026-01-01T00:00:00.000Z","exitCode":0}',
      '',
      'not json',
      '{"gate":"b","ts":"2026-01-02T00:00:00.000Z","exitCode":1}',
    ].join('\n');
    const entries = parseLog(raw);
    expect(entries).toEqual([
      { gate: 'a', ts: '2026-01-01T00:00:00.000Z', exitCode: 0 },
      { gate: 'b', ts: '2026-01-02T00:00:00.000Z', exitCode: 1 },
    ]);
  });
});

describe('trimOldEntries', () => {
  it('drops entries older than one year relative to `now`', () => {
    const now = Date.parse('2026-09-16T00:00:00.000Z');
    const entries = [
      { gate: 'a', ts: '2025-09-01T00:00:00.000Z', exitCode: 0 }, // older than 1y
      { gate: 'b', ts: '2026-09-01T00:00:00.000Z', exitCode: 0 }, // within 1y
    ];
    expect(trimOldEntries(entries, now)).toEqual([entries[1]]);
  });

  it('drops entries with an unparsable timestamp', () => {
    const now = Date.parse('2026-09-16T00:00:00.000Z');
    const entries = [{ gate: 'a', ts: 'not-a-date', exitCode: 0 }];
    expect(trimOldEntries(entries, now)).toEqual([]);
  });
});

describe('computeStats', () => {
  it('tracks lastFiringAt across both passing and failing runs', () => {
    const entries = [
      { gate: 'check-a', ts: '2026-01-01T00:00:00.000Z', exitCode: 0 },
      { gate: 'check-a', ts: '2026-02-01T00:00:00.000Z', exitCode: 0 },
    ];
    const stats = computeStats(entries);
    expect(stats.get('check-a')).toEqual({
      lastFiringAt: '2026-02-01T00:00:00.000Z',
      lastViolationAt: null,
    });
  });

  it('sets lastViolationAt only from non-zero exit codes, independent of lastFiringAt', () => {
    const entries = [
      { gate: 'check-b', ts: '2026-01-01T00:00:00.000Z', exitCode: 1 },
      { gate: 'check-b', ts: '2026-02-01T00:00:00.000Z', exitCode: 0 },
    ];
    const stats = computeStats(entries);
    expect(stats.get('check-b')).toEqual({
      lastFiringAt: '2026-02-01T00:00:00.000Z',
      lastViolationAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps the latest violation when multiple failures are logged', () => {
    const entries = [
      { gate: 'check-c', ts: '2026-01-01T00:00:00.000Z', exitCode: 1 },
      { gate: 'check-c', ts: '2026-03-01T00:00:00.000Z', exitCode: 2 },
      { gate: 'check-c', ts: '2026-02-01T00:00:00.000Z', exitCode: 1 },
    ];
    const stats = computeStats(entries);
    expect(stats.get('check-c').lastViolationAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps gates independent and skips malformed entries', () => {
    const entries = [
      { gate: 'check-a', ts: '2026-01-01T00:00:00.000Z', exitCode: 0 },
      { gate: 'check-b', ts: '2026-01-01T00:00:00.000Z', exitCode: 1 },
      { gate: 123, ts: '2026-01-01T00:00:00.000Z', exitCode: 1 },
      null,
    ];
    const stats = computeStats(entries);
    expect([...stats.keys()].sort()).toEqual(['check-a', 'check-b']);
    expect(stats.get('check-a').lastViolationAt).toBeNull();
    expect(stats.get('check-b').lastViolationAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns an empty map for an empty log', () => {
    expect(computeStats([]).size).toBe(0);
  });
});
