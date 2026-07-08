/**
 * lib/tasks/tier.mjs — pure tier→model routing (Fleet epic #41, Slice 1).
 *
 * No network, no Ollama, no Date — every case is a plain object in, a plain
 * object out.
 */

import { describe, it, expect } from 'vitest';
import { pickTier, pickModel, routeTask } from '../../lib/tasks/tier.mjs';

describe('pickTier — judgment triggers', () => {
  it('high priority forces judgment regardless of effort/title', () => {
    expect(pickTier({ priority: 'high', effort: 'S', title: 'Fix a typo' })).toBe('judgment');
  });

  it('L effort forces judgment regardless of priority/title', () => {
    expect(pickTier({ priority: 'low', effort: 'L', title: 'Fix a typo' })).toBe('judgment');
  });

  it('title keywords force judgment: architecture', () => {
    expect(pickTier({ title: 'Rework the ingestion architecture' })).toBe('judgment');
  });

  it('title keywords force judgment: migration', () => {
    expect(pickTier({ title: 'Write the tasks migration' })).toBe('judgment');
  });

  it('title keywords force judgment: security', () => {
    expect(pickTier({ title: 'Audit security on the login gate' })).toBe('judgment');
  });

  it('title keywords force judgment: refactor', () => {
    expect(pickTier({ title: 'Refactor the dispatch handler' })).toBe('judgment');
  });

  it('title keywords force judgment: validator', () => {
    expect(pickTier({ title: 'Add a new validator' })).toBe('judgment');
  });

  it('title keywords force judgment: schema', () => {
    expect(pickTier({ title: 'Extend the leads schema' })).toBe('judgment');
  });

  it('title keywords force judgment: auth', () => {
    expect(pickTier({ title: 'Fix the auth cookie' })).toBe('judgment');
  });

  it('title keywords force judgment: design', () => {
    expect(pickTier({ title: 'Redo the design tokens' })).toBe('judgment');
  });

  it('title keywords force judgment: ambiguous', () => {
    expect(pickTier({ title: 'Handle this ambiguous case' })).toBe('judgment');
  });
});

describe('pickTier — mechanical triggers', () => {
  it('S effort + non-high priority is mechanical', () => {
    expect(pickTier({ priority: 'low', effort: 'S', title: 'Update the button spacing' })).toBe(
      'mechanical',
    );
  });

  it('S effort + high priority is judgment, not mechanical (priority wins)', () => {
    expect(pickTier({ priority: 'high', effort: 'S', title: 'Update the button spacing' })).toBe(
      'judgment',
    );
  });

  it('title keywords force mechanical: rename', () => {
    expect(pickTier({ effort: 'M', title: 'Rename the helper function' })).toBe('mechanical');
  });

  it('title keywords force mechanical: typo', () => {
    expect(pickTier({ effort: 'M', title: 'Fix typo in README' })).toBe('mechanical');
  });

  it('title keywords force mechanical: bump', () => {
    expect(pickTier({ effort: 'M', title: 'Bump the lockfile' })).toBe('mechanical');
  });

  it('title keywords force mechanical: lint', () => {
    expect(pickTier({ effort: 'M', title: 'Fix a lint warning' })).toBe('mechanical');
  });

  it('title keywords force mechanical: format', () => {
    expect(pickTier({ effort: 'M', title: 'Format the changelog' })).toBe('mechanical');
  });

  it('title keywords force mechanical: copy', () => {
    expect(pickTier({ effort: 'M', title: 'Update marketing copy' })).toBe('mechanical');
  });

  it('title keywords force mechanical: chip', () => {
    expect(pickTier({ effort: 'M', title: 'Add a status chip' })).toBe('mechanical');
  });

  it('title keywords force mechanical: docs', () => {
    expect(pickTier({ effort: 'M', title: 'Update the docs' })).toBe('mechanical');
  });

  it('title keywords force mechanical: doc (singular, word-boundary)', () => {
    expect(pickTier({ effort: 'M', title: 'Write a runbook doc' })).toBe('mechanical');
  });
});

describe('pickTier — standard default', () => {
  it('falls back to standard when nothing matches', () => {
    expect(
      pickTier({ priority: 'med', effort: 'M', title: 'Add pagination to the tasks board' }),
    ).toBe('standard');
  });

  it('defaults to standard on an empty task', () => {
    expect(pickTier({})).toBe('standard');
  });

  it('defaults to standard with no args', () => {
    expect(pickTier()).toBe('standard');
  });

  it('null priority/effort/title do not throw and land on standard', () => {
    expect(pickTier({ priority: null, effort: null, title: null })).toBe('standard');
  });
});

describe('pickModel', () => {
  it('mechanical routes to sonnet', () => {
    expect(pickModel('mechanical')).toBe('sonnet');
  });

  it('standard routes to sonnet', () => {
    expect(pickModel('standard')).toBe('sonnet');
  });

  it('judgment routes to opus', () => {
    expect(pickModel('judgment')).toBe('opus');
  });

  it('never returns haiku for any known tier', () => {
    for (const tier of ['mechanical', 'standard', 'judgment']) {
      expect(pickModel(tier)).not.toBe('haiku');
    }
  });

  it('throws on an unknown tier', () => {
    expect(() => pickModel('unknown')).toThrow(/Unknown tier/);
  });
});

describe('routeTask — representative tasks', () => {
  it('a high-priority architecture task routes to judgment/opus', () => {
    expect(
      routeTask({ priority: 'high', effort: 'M', title: 'Redesign the auth architecture' }),
    ).toEqual({
      tier: 'judgment',
      model: 'opus',
    });
  });

  it('an S/low typo fix routes to mechanical/sonnet', () => {
    expect(routeTask({ priority: 'low', effort: 'S', title: 'Fix typo in nav label' })).toEqual({
      tier: 'mechanical',
      model: 'sonnet',
    });
  });

  it('a default mid-size task routes to standard/sonnet', () => {
    expect(
      routeTask({ priority: 'med', effort: 'M', title: 'Add pagination to the tasks board' }),
    ).toEqual({
      tier: 'standard',
      model: 'sonnet',
    });
  });
});
