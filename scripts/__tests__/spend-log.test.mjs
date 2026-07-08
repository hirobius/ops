import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendSpend,
  readSpend,
  validateSpendEntry,
  sumSpendSince,
  SPEND_LOG_PATH,
} from '../../lib/ops/spend-log.mjs';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'spend-log-test-'));
  return join(dir, 'spend-log.jsonl');
}

describe('SPEND_LOG_PATH', () => {
  it('points at docs/ops/spend-log.jsonl', () => {
    expect(SPEND_LOG_PATH.endsWith(join('docs', 'ops', 'spend-log.jsonl'))).toBe(true);
  });
});

describe('validateSpendEntry', () => {
  it('passes for a complete entry', () => {
    expect(() =>
      validateSpendEntry({
        ts: '2026-07-08T00:00:00Z',
        task: 'github:hirobius/ops#1',
        tier: 'standard',
        model: 'sonnet',
        costUsd: 0.024,
      }),
    ).not.toThrow();
  });

  it('throws naming missing string fields', () => {
    expect(() => validateSpendEntry({ ts: '2026-07-08T00:00:00Z' })).toThrow(/task|tier|model/);
  });

  it('throws when costUsd is missing or not a finite number', () => {
    expect(() =>
      validateSpendEntry({ ts: 't', task: 'k', tier: 'standard', model: 'sonnet' }),
    ).toThrow(/costUsd/);
    expect(() =>
      validateSpendEntry({ ts: 't', task: 'k', tier: 'standard', model: 'sonnet', costUsd: NaN }),
    ).toThrow(/costUsd/);
  });

  it('throws for a non-object entry', () => {
    expect(() => validateSpendEntry(null)).toThrow();
  });
});

describe('appendSpend', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('appends one JSON line with only the recognized fields', () => {
    path = tmpPath();
    const row = appendSpend(
      {
        ts: '2026-07-08T10:00:00Z',
        task: 'github:hirobius/ops#1',
        tier: 'standard',
        model: 'sonnet',
        costUsd: 0.024,
        bogus: 'dropped',
      },
      { path },
    );
    expect(row).toEqual({
      ts: '2026-07-08T10:00:00Z',
      task: 'github:hirobius/ops#1',
      tier: 'standard',
      model: 'sonnet',
      costUsd: 0.024,
    });
    const raw = readFileSync(path, 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toEqual(row);
  });

  it('creates the parent directory if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spend-log-test-'));
    path = join(dir, 'nested', 'deeper', 'spend-log.jsonl');
    appendSpend(
      { ts: '2026-07-08T10:00:00Z', task: 'k', tier: 'standard', model: 'sonnet', costUsd: 0.01 },
      { path },
    );
    expect(existsSync(path)).toBe(true);
  });

  it('rejects an entry missing a required field before writing anything', () => {
    path = tmpPath();
    expect(() =>
      appendSpend({ task: 'k', tier: 'standard', model: 'sonnet', costUsd: 0.01 }, { path }),
    ).toThrow();
    expect(existsSync(path)).toBe(false);
  });
});

describe('readSpend', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('returns [] when the file does not exist', () => {
    path = tmpPath();
    expect(readSpend({ path })).toEqual([]);
  });

  it('skips malformed lines instead of throwing', () => {
    path = tmpPath();
    appendSpend(
      { ts: '2026-07-08T09:00:00Z', task: 'a', tier: 'standard', model: 'sonnet', costUsd: 0.01 },
      { path },
    );
    appendFileSync(path, 'not json\n');
    const rows = readSpend({ path });
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe('a');
  });
});

describe('sumSpendSince', () => {
  const rows = [
    { ts: '2026-07-08T00:00:00.000Z', costUsd: 0.01 },
    { ts: '2026-07-08T12:00:00.000Z', costUsd: 0.02 },
    { ts: '2026-07-07T23:59:00.000Z', costUsd: 100 }, // yesterday — excluded
  ];
  const startOfToday = new Date('2026-07-08T00:00:00.000Z').getTime();

  it('sums only rows at/after sinceMs', () => {
    expect(sumSpendSince(rows, startOfToday)).toBeCloseTo(0.03, 6);
  });

  it('excludes rows with unparseable ts or non-numeric costUsd', () => {
    const dirty = [
      { ts: 'not-a-date', costUsd: 5 },
      { ts: '2026-07-08T01:00:00.000Z', costUsd: 'oops' },
      { ts: '2026-07-08T02:00:00.000Z', costUsd: 0.05 },
    ];
    expect(sumSpendSince(dirty, startOfToday)).toBeCloseTo(0.05, 6);
  });

  it('returns 0 for an empty/non-array list', () => {
    expect(sumSpendSince([], startOfToday)).toBe(0);
    expect(sumSpendSince(undefined, startOfToday)).toBe(0);
  });
});
