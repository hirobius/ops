import { describe, it, expect } from 'vitest';
import { getByPath, resolveAlias, walkLeafPaths } from '../lib/token-resolver.mjs';

const FIXTURE = {
  primitive: {
    color: { $type: 'color', white: { $value: '#ffffff' }, black: { $value: '#000000' } },
  },
  semantic: { color: { surface: { page: { $value: '{primitive.color.white}' } } } },
  chain: { a: { $value: '{chain.b}' }, b: { $value: '{primitive.color.black}' } },
};

describe('getByPath', () => {
  it('returns the node at a dot path', () => {
    expect(getByPath(FIXTURE, 'primitive.color.white')).toEqual({ $value: '#ffffff' });
  });
  it('returns undefined for a missing path', () => {
    expect(getByPath(FIXTURE, 'primitive.color.none')).toBeUndefined();
    expect(getByPath(FIXTURE, 'a.b.c.d')).toBeUndefined();
  });
});

describe('resolveAlias', () => {
  it('resolves a one-hop alias to its concrete value', () => {
    expect(resolveAlias('{primitive.color.white}', FIXTURE)).toBe('#ffffff');
  });
  it('follows a multi-hop alias chain', () => {
    expect(resolveAlias('{chain.a}', FIXTURE)).toBe('#000000');
  });
  it('returns a non-alias value unchanged', () => {
    expect(resolveAlias('#abcdef', FIXTURE)).toBe('#abcdef');
  });
  it('throws on a missing referenced path', () => {
    expect(() => resolveAlias('{primitive.color.nope}', FIXTURE)).toThrow(/not found/);
  });
});

describe('walkLeafPaths', () => {
  it('yields every $value leaf path, skipping $-keys', () => {
    expect([...walkLeafPaths(FIXTURE)].sort()).toEqual([
      'chain.a',
      'chain.b',
      'primitive.color.black',
      'primitive.color.white',
      'semantic.color.surface.page',
    ]);
  });
});
