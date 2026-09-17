/**
 * lib/pii/denylist.mjs — parsing and loading the out-of-repo PII denylist.
 * All terms below are synthetic.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseDenylist, loadDenylist, DENYLIST_FILE } from '../../lib/pii/denylist.mjs';

describe('parseDenylist', () => {
  it('compiles one case-insensitive regex per non-comment line, keyed by line number', () => {
    const { entries, invalid } = parseDenylist(
      '# header\n\njane\\s+example\n  Example Client Co  \n',
    );
    expect(invalid).toEqual([]);
    expect(entries.map((e) => e.index)).toEqual([3, 4]);
    expect(entries[1].regex.test('an EXAMPLE CLIENT CO invoice')).toBe(true);
  });

  it('reports broken and match-everything entries by line number only, and skips them', () => {
    const { entries, invalid } = parseDenylist('jane(example\nfine term\n.*\n', {
      source: '.pii-denylist',
    });
    expect(entries.map((e) => e.index)).toEqual([2]);
    expect(invalid.map((i) => [i.index, i.source])).toEqual([
      [1, '.pii-denylist'],
      [3, '.pii-denylist'],
    ]);
    expect(JSON.stringify(invalid)).not.toMatch(/jane/);
  });
});

describe('loadDenylist', () => {
  const root = join('repo', 'root');
  const fileAt =
    (contents, dir = root) =>
    (path) =>
      path === join(dir, DENYLIST_FILE) ? contents : null;

  it('merges the PII_DENYLIST variable and the local .pii-denylist file', () => {
    const loaded = loadDenylist({
      env: { PII_DENYLIST: 'jane\\s+example' },
      roots: [root],
      readFile: fileAt('# local\nexample client co'),
    });
    expect(loaded.sources).toEqual(['PII_DENYLIST', '.pii-denylist']);
    expect(loaded.entries.map((e) => `${e.source}:${e.index}`)).toEqual([
      'PII_DENYLIST:1',
      '.pii-denylist:2',
    ]);
  });

  it('treats an empty variable (an unset Actions secret) as absent', () => {
    const loaded = loadDenylist({
      env: { PII_DENYLIST: '  \n' },
      roots: [root],
      readFile: fileAt(null),
    });
    expect(loaded.sources).toEqual([]);
    expect(loaded.entries).toEqual([]);
  });

  it('works from the file alone', () => {
    const loaded = loadDenylist({
      env: {},
      roots: [root],
      readFile: fileAt('example client co\n'),
    });
    expect(loaded.sources).toEqual(['.pii-denylist']);
    expect(loaded.entries).toHaveLength(1);
  });

  it("falls back to the main checkout's file when a worktree has none of its own", () => {
    const worktree = join('repo', 'root', '.claude', 'worktrees', 'session-1');
    const loaded = loadDenylist({
      env: {},
      roots: [worktree, root],
      readFile: fileAt('example client co\n', root),
    });
    expect(loaded.sources).toEqual(['.pii-denylist']);
    expect(loaded.entries).toHaveLength(1);
  });
});
