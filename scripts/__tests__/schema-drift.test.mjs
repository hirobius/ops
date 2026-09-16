/**
 * Tests for lib/schema/drift.mjs — the guard that would have caught ops going
 * stale against site-engine while every existing gate stayed green.
 */
import { describe, expect, it } from 'vitest';

import { collectEnums, diffEnums } from '../../lib/schema/drift.mjs';

const snap = (fields) => ({ shape: { kind: 'object', fields } });
const enumAt = (values) => ({ shape: { kind: 'enum', values } });

describe('collectEnums', () => {
  it('records enums by dotted config path, skipping structural wrappers', () => {
    const found = collectEnums(snap({ brand: snap({ font: enumAt(['inter', 'system']) }) }));
    expect([...found.keys()]).toEqual(['brand.font']);
    expect(found.get('brand.font')).toEqual(['inter', 'system']);
  });

  it('sorts values so declaration order is not mistaken for drift', () => {
    const found = collectEnums(snap({ a: enumAt(['c', 'a', 'b']) }));
    expect(found.get('a')).toEqual(['a', 'b', 'c']);
  });

  it('finds enums nested under arrays', () => {
    const found = collectEnums(
      snap({
        layout: snap({ sectionOrder: { shape: { kind: 'array', of: enumAt(['x', 'y']) } } }),
      }),
    );
    expect(found.get('layout.sectionOrder.of')).toEqual(['x', 'y']);
  });

  it('handles an empty or non-object input', () => {
    expect(collectEnums(null).size).toBe(0);
    expect(collectEnums({}).size).toBe(0);
  });
});

describe('diffEnums', () => {
  const expected = collectEnums(
    snap({
      brand: snap({ font: enumAt(['inter', 'system']) }),
      layout: snap({ services: enumAt(['grid', 'cards', 'alternating']) }),
    }),
  );

  it('passes when ops matches the snapshot', () => {
    expect(
      diffEnums(expected, {
        'brand.font': ['system', 'inter'],
        'layout.services': ['grid', 'cards', 'alternating'],
      }),
    ).toEqual([]);
  });

  it('catches the real 2026-09-16 drift — shipped variants ops could not reach', () => {
    const diffs = diffEnums(expected, { 'layout.services': ['grid'] });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe('layout.services');
    expect(diffs[0].missingInOps).toEqual(['alternating', 'cards']);
    expect(diffs[0].unknownToEngine).toEqual([]);
  });

  it('also catches the reverse — ops offering what the engine would reject', () => {
    const diffs = diffEnums(expected, { 'brand.font': ['inter', 'system', 'comic-sans'] });
    expect(diffs[0].unknownToEngine).toEqual(['comic-sans']);
    expect(diffs[0].missingInOps).toEqual([]);
  });

  it('ignores ops-only paths the snapshot does not describe', () => {
    expect(diffEnums(expected, { 'ops.onlyField': ['a'] })).toEqual([]);
  });

  it('is order-insensitive', () => {
    expect(diffEnums(expected, { 'brand.font': ['system', 'inter'] })).toEqual([]);
  });
});
