import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { entryFiles, computeHash, rawUrl, verifyInstalled } from '../lib/skills-lock.mjs';

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'skills-lock-'));
  cleanup.push(dir);
  return dir;
}

describe('entryFiles', () => {
  it('returns just the skillPath file when there are no extra paths', () => {
    expect(entryFiles({ skillPath: 'skills/demo/SKILL.md' })).toEqual([
      { relPath: 'SKILL.md', sourcePath: 'skills/demo/SKILL.md' },
    ]);
  });

  it('resolves extra paths relative to the skill directory and sorts by relPath', () => {
    const files = entryFiles({ skillPath: 'skills/demo/SKILL.md', paths: ['z.md', 'a.md'] });
    expect(files).toEqual([
      { relPath: 'a.md', sourcePath: 'skills/demo/a.md' },
      { relPath: 'SKILL.md', sourcePath: 'skills/demo/SKILL.md' },
      { relPath: 'z.md', sourcePath: 'skills/demo/z.md' },
    ]);
  });
});

describe('computeHash', () => {
  it('single-file hash equals a plain sha256 of the bytes (backward-compatible with the legacy scheme)', () => {
    const content = Buffer.from('hello world\n');
    const expected = createHash('sha256').update(content).digest('hex');
    expect(computeHash([{ relPath: 'SKILL.md', content }])).toBe(expected);
  });

  it('multi-file hash is independent of input order (sorted internally)', () => {
    const a = { relPath: 'a.md', content: Buffer.from('a') };
    const b = { relPath: 'b.md', content: Buffer.from('b') };
    expect(computeHash([a, b])).toBe(computeHash([b, a]));
  });

  it('multi-file hash changes if a file is renamed even with identical bytes', () => {
    const content = Buffer.from('same bytes');
    const hash1 = computeHash([
      { relPath: 'a.md', content },
      { relPath: 'b.md', content: Buffer.from('other') },
    ]);
    const hash2 = computeHash([
      { relPath: 'renamed.md', content },
      { relPath: 'b.md', content: Buffer.from('other') },
    ]);
    expect(hash1).not.toBe(hash2);
  });
});

describe('rawUrl', () => {
  it('builds a raw.githubusercontent.com URL from source, ref, and path', () => {
    expect(rawUrl('owner/repo', 'deadbeef', 'skills/demo/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/owner/repo/deadbeef/skills/demo/SKILL.md',
    );
  });
});

describe('verifyInstalled', () => {
  const entry = { skillPath: 'skills/demo/SKILL.md', computedHash: null };

  it('reports missing when the skill directory has no files', () => {
    const root = tmp();
    const result = verifyInstalled(root, 'demo', entry);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
    expect(result.missing).toEqual(['SKILL.md']);
  });

  it('reports ok when installed bytes match computedHash', () => {
    const root = tmp();
    const content = Buffer.from('demo skill content\n');
    const dir = join(root, '.claude', 'skills', 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), content);
    const hash = createHash('sha256').update(content).digest('hex');
    const result = verifyInstalled(root, 'demo', { ...entry, computedHash: hash });
    expect(result.ok).toBe(true);
  });

  it('reports hash-mismatch when installed bytes drifted from computedHash', () => {
    const root = tmp();
    const dir = join(root, '.claude', 'skills', 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), Buffer.from('drifted content\n'));
    const result = verifyInstalled(root, 'demo', { ...entry, computedHash: 'a'.repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('hash-mismatch');
    expect(result.expected).toBe('a'.repeat(64));
  });
});
