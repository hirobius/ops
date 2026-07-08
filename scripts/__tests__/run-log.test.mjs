import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendRun, readRuns, validateRunEntry, RUN_LOG_PATH } from '../../lib/ops/run-log.mjs';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'run-log-test-'));
  return join(dir, 'run-log.jsonl');
}

describe('RUN_LOG_PATH', () => {
  it('points at docs/ops/run-log.jsonl', () => {
    expect(RUN_LOG_PATH.endsWith(join('docs', 'ops', 'run-log.jsonl'))).toBe(true);
  });
});

describe('validateRunEntry', () => {
  it('passes for a complete entry', () => {
    expect(() =>
      validateRunEntry({
        ts: '2026-07-07T00:00:00Z',
        actor: 'claude',
        outcome: 'shipped',
        summary: 'ok',
      }),
    ).not.toThrow();
  });

  it('throws naming every missing required field', () => {
    expect(() => validateRunEntry({ ts: '2026-07-07T00:00:00Z' })).toThrow(
      /actor.*outcome.*summary|outcome.*summary.*actor|actor|outcome|summary/,
    );
  });

  it('throws for a non-object entry', () => {
    expect(() => validateRunEntry(null)).toThrow();
    expect(() => validateRunEntry('nope')).toThrow();
  });

  it('throws when a required field is an empty string', () => {
    expect(() =>
      validateRunEntry({ ts: '', actor: 'claude', outcome: 'shipped', summary: 'ok' }),
    ).toThrow(/ts/);
  });
});

describe('appendRun', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('appends one JSON line with only the recognized fields', () => {
    path = tmpPath();
    const row = appendRun(
      {
        ts: '2026-07-07T10:00:00Z',
        actor: 'claude-subagent',
        outcome: 'shipped',
        summary: 'did a thing',
        task: '#1',
        bogus: 'dropped',
      },
      { path },
    );
    expect(row).toEqual({
      ts: '2026-07-07T10:00:00Z',
      actor: 'claude-subagent',
      outcome: 'shipped',
      summary: 'did a thing',
      task: '#1',
    });
    const raw = readFileSync(path, 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toEqual(row);
  });

  it('includes a valid numeric tokens field', () => {
    path = tmpPath();
    const row = appendRun(
      {
        ts: '2026-07-07T10:00:00Z',
        actor: 'claude',
        outcome: 'shipped',
        summary: 'did a thing',
        tokens: 45200,
      },
      { path },
    );
    expect(row.tokens).toBe(45200);
  });

  it('drops a non-finite or negative tokens value rather than throwing', () => {
    path = tmpPath();
    const row = appendRun(
      {
        ts: '2026-07-07T10:00:00Z',
        actor: 'claude',
        outcome: 'shipped',
        summary: 'x',
        tokens: NaN,
      },
      { path },
    );
    expect(row.tokens).toBeUndefined();

    const row2 = appendRun(
      {
        ts: '2026-07-07T10:00:01Z',
        actor: 'claude',
        outcome: 'shipped',
        summary: 'y',
        tokens: -5,
      },
      { path },
    );
    expect(row2.tokens).toBeUndefined();
  });

  it('creates the parent directory if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'run-log-test-'));
    path = join(dir, 'nested', 'deeper', 'run-log.jsonl');
    appendRun(
      { ts: '2026-07-07T10:00:00Z', actor: 'claude', outcome: 'no-op', summary: 'nothing to do' },
      { path },
    );
    expect(existsSync(path)).toBe(true);
  });

  it('appends without clobbering existing lines', () => {
    path = tmpPath();
    appendRun(
      { ts: '2026-07-07T10:00:00Z', actor: 'claude', outcome: 'shipped', summary: 'first' },
      { path },
    );
    appendRun(
      { ts: '2026-07-07T11:00:00Z', actor: 'claude', outcome: 'shipped', summary: 'second' },
      { path },
    );
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('rejects an entry missing a required field before writing anything', () => {
    path = tmpPath();
    expect(() =>
      appendRun({ actor: 'claude', outcome: 'shipped', summary: 'x' }, { path }),
    ).toThrow();
    expect(existsSync(path)).toBe(false);
  });
});

describe('readRuns', () => {
  let path;
  afterEach(() => {
    if (path) rmSync(path, { force: true });
  });

  it('returns [] when the file does not exist', () => {
    path = tmpPath();
    expect(readRuns(undefined, { path })).toEqual([]);
  });

  it('returns entries newest-first by ts', () => {
    path = tmpPath();
    appendRun(
      { ts: '2026-07-07T09:00:00Z', actor: 'a', outcome: 'shipped', summary: 'first' },
      { path },
    );
    appendRun(
      { ts: '2026-07-07T11:00:00Z', actor: 'b', outcome: 'shipped', summary: 'third' },
      { path },
    );
    appendRun(
      { ts: '2026-07-07T10:00:00Z', actor: 'c', outcome: 'shipped', summary: 'second' },
      { path },
    );
    const runs = readRuns(undefined, { path });
    expect(runs.map((r) => r.summary)).toEqual(['third', 'second', 'first']);
  });

  it('respects the limit argument', () => {
    path = tmpPath();
    for (let i = 0; i < 5; i += 1) {
      appendRun(
        { ts: `2026-07-07T0${i}:00:00Z`, actor: 'a', outcome: 'shipped', summary: `n${i}` },
        { path },
      );
    }
    expect(readRuns(2, { path })).toHaveLength(2);
    expect(readRuns(2, { path }).map((r) => r.summary)).toEqual(['n4', 'n3']);
  });

  it('skips malformed lines instead of throwing', () => {
    path = tmpPath();
    appendRun(
      { ts: '2026-07-07T09:00:00Z', actor: 'a', outcome: 'shipped', summary: 'good' },
      { path },
    );
    // Inject a bad line directly.
    appendFileSync(path, 'not json\n');
    const runs = readRuns(undefined, { path });
    expect(runs).toHaveLength(1);
    expect(runs[0].summary).toBe('good');
  });

  it('later-appended entries with equal/invalid ts win the tie', () => {
    path = tmpPath();
    appendRun({ ts: 'not-a-date', actor: 'a', outcome: 'shipped', summary: 'older' }, { path });
    appendRun({ ts: 'not-a-date', actor: 'b', outcome: 'shipped', summary: 'newer' }, { path });
    const runs = readRuns(undefined, { path });
    expect(runs.map((r) => r.summary)).toEqual(['newer', 'older']);
  });
});
