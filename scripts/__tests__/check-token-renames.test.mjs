/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Unit tests for scripts/check-token-renames.mjs
 *
 * All tests operate purely in memory — no filesystem reads or writes.
 */

import { describe, it, expect } from 'vitest';
import {
  parseMigrationLog,
  findUndocumentedRemovals,
} from '../check-token-renames.mjs';

// ── parseMigrationLog ─────────────────────────────────────────────────────────
describe('parseMigrationLog', () => {
  it('parses a rename entry', () => {
    const content = 'semantic.old.path -> semantic.new.path     (renamed 2026-05-01)';
    const result  = parseMigrationLog(content);
    expect(result.has('semantic.old.path')).toBe(true);
  });

  it('parses a removal entry', () => {
    const content = 'primitive.dropped.thing -> removed      (removed 2026-05-01, no replacement)';
    const result  = parseMigrationLog(content);
    expect(result.has('primitive.dropped.thing')).toBe(true);
  });

  it('ignores comment lines and blank lines', () => {
    const content = [
      '# Token Migration Log',
      '',
      '## Entries',
      '',
      '<none yet>',
    ].join('\n');
    const result = parseMigrationLog(content);
    expect(result.size).toBe(0);
  });

  it('parses multiple entries', () => {
    const content = [
      'semantic.color.foo -> semantic.color.bar     (renamed 2026-05-01)',
      'primitive.space.old -> removed               (removed 2026-05-01)',
    ].join('\n');
    const result = parseMigrationLog(content);
    expect(result.has('semantic.color.foo')).toBe(true);
    expect(result.has('primitive.space.old')).toBe(true);
    expect(result.size).toBe(2);
  });
});

// ── findUndocumentedRemovals — empty diff ────────────────────────────────────
describe('findUndocumentedRemovals — passes when removed set is empty', () => {
  it('returns empty array when current paths equal baseline', () => {
    const paths = [
      'semantic.color.surface.raised',
      'primitive.typography.lineHeight.none',
      'component.badge.bg',
    ];
    const result = findUndocumentedRemovals(paths, paths, '');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when current has MORE paths than baseline', () => {
    const baseline = ['semantic.color.surface.raised'];
    const current  = ['semantic.color.surface.raised', 'semantic.color.surface.new'];
    const result   = findUndocumentedRemovals(current, baseline, '');
    expect(result).toHaveLength(0);
  });
});

// ── findUndocumentedRemovals — undocumented removal ──────────────────────────
describe('findUndocumentedRemovals — fails when a removed path has no migration entry', () => {
  it('returns the missing path when it has no entry in TOKEN_MIGRATION.md', () => {
    const baseline = [
      'semantic.color.surface.raised',
      'semantic.color.surface.sunken',
    ];
    const current = ['semantic.color.surface.raised']; // sunken was removed
    const result  = findUndocumentedRemovals(current, baseline, '# Token Migration Log\n\n## Entries\n\n<none yet>');
    expect(result).toEqual(['semantic.color.surface.sunken']);
  });

  it('returns all undocumented paths when multiple are missing', () => {
    const baseline = ['a.b.c', 'd.e.f', 'g.h.i'];
    const current  = ['a.b.c'];
    const result   = findUndocumentedRemovals(current, baseline, '');
    expect(result).toHaveLength(2);
    expect(result).toContain('d.e.f');
    expect(result).toContain('g.h.i');
  });
});

// ── findUndocumentedRemovals — rename entry ───────────────────────────────────
describe('findUndocumentedRemovals — passes when removed path has a rename entry', () => {
  it('returns empty array when removed path is documented as renamed', () => {
    const baseline = ['semantic.color.surface.raised', 'semantic.color.surface.sunken'];
    const current  = ['semantic.color.surface.raised', 'semantic.color.surface.deep'];
    const migration = [
      '# Token Migration Log',
      '## Entries',
      'semantic.color.surface.sunken -> semantic.color.surface.deep     (renamed 2026-05-01)',
    ].join('\n');
    const result = findUndocumentedRemovals(current, baseline, migration);
    expect(result).toHaveLength(0);
  });
});

// ── findUndocumentedRemovals — removal entry ─────────────────────────────────
describe('findUndocumentedRemovals — passes when removed path has a "removed" entry', () => {
  it('returns empty array when removed path is documented as explicitly removed', () => {
    const baseline = ['primitive.space.deprecated', 'primitive.space.base'];
    const current  = ['primitive.space.base'];
    const migration = [
      '# Token Migration Log',
      '## Entries',
      'primitive.space.deprecated -> removed      (removed 2026-05-01, no replacement)',
    ].join('\n');
    const result = findUndocumentedRemovals(current, baseline, migration);
    expect(result).toHaveLength(0);
  });
});
