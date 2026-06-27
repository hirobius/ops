import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFiles } from '../lib/source-scanner.mjs';

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
  delete process.env.HDS_FIXTURE_MODE;
  delete process.env.FIXTURE_FILE;
});

describe('scanFiles', () => {
  it('walks roots, filters by extension + skipDirs, reads lines, accumulates pushes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-'));
    cleanup.push(dir);
    writeFileSync(join(dir, 'a.ts'), 'keep\nMATCH\n');
    writeFileSync(join(dir, 'b.css'), 'MATCH\n'); // wrong extension → ignored
    const found = scanFiles({
      roots: [dir],
      extensions: ['.ts'],
      check(lines, rel, push) {
        lines.forEach((line, i) => {
          if (line === 'MATCH') push({ rel, line: i + 1 });
        });
      },
    });
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].rel).toMatch(/a\.ts$/);
  });

  it('fixture mode scopes the scan to the one FIXTURE_FILE', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-'));
    cleanup.push(dir);
    const file = join(dir, 'only.ts');
    writeFileSync(file, 'x\nHIT\n');
    process.env.HDS_FIXTURE_MODE = '1';
    process.env.FIXTURE_FILE = file;
    const found = scanFiles({
      roots: ['/does/not/matter'],
      extensions: ['.ts'],
      check(lines, rel, push) {
        if (lines.includes('HIT')) push({ rel });
      },
    });
    expect(found).toHaveLength(1);
  });
});
