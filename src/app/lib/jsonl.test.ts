import { describe, it, expect } from 'vitest';
import { parseJsonlLines } from './jsonl';

describe('parseJsonlLines', () => {
  it('returns [] for empty / nullish input', () => {
    expect(parseJsonlLines('')).toEqual([]);
    expect(parseJsonlLines(null)).toEqual([]);
    expect(parseJsonlLines(undefined)).toEqual([]);
  });

  it('parses one object per non-blank line', () => {
    const raw = '{"a":1}\n{"a":2}\n';
    expect(parseJsonlLines<{ a: number }>(raw)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('trims whitespace and skips blank lines', () => {
    const raw = '  {"a":1}  \n\n   \n{"a":2}';
    expect(parseJsonlLines<{ a: number }>(raw)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('SKIPS malformed lines instead of throwing (the strength-tab parseHistory crash fix)', () => {
    const raw = '{"a":1}\nnot json\n{"a":2}';
    expect(parseJsonlLines<{ a: number }>(raw)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
