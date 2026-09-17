/**
 * lib/pii/diff.mjs — turning `git diff -U0` output into the added text the PII
 * gate scans. Only ADDED lines are scanned, so content already on main never
 * blocks an unrelated commit.
 */
import { describe, it, expect } from 'vitest';
import { addedBlocks, addedInAll, addedLineBlocks } from '../../lib/pii/diff.mjs';

const OLD = '1'.repeat(40);
const OTHER = '3'.repeat(40);
const NEW = '2'.repeat(40);
const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

const diff = [
  'diff --git a/docs/notes.md b/docs/notes.md',
  'index 1111111..2222222 100644',
  '--- a/docs/notes.md',
  '+++ b/docs/notes.md',
  '@@ -3,0 +4,2 @@ heading',
  '+first added',
  '+second added\r',
  '@@ -10 +12 @@',
  '-old line',
  '+++counter starts with two pluses',
  'diff --git a/logo.png b/logo.png',
  'index 3333333..4444444 100644',
  'Binary files a/logo.png and b/logo.png differ',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-bye',
  'diff --git a/new.txt b/new.txt',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.txt',
  '@@ -0,0 +1 @@',
  '+no trailing newline',
  '\\ No newline at end of file',
  // A path with a space: git ends the ---/+++ header with a TAB (for GNU patch).
  'diff --git "a/docs/caf\\303\\251 \\"q\\".md" "b/docs/caf\\303\\251 \\"q\\".md"',
  `--- "a/docs/caf\\303\\251 \\"q\\".md"${TAB}`,
  `+++ "b/docs/caf\\303\\251 \\"q\\".md"${TAB}`,
  '@@ -0,0 +7 @@',
  '+quoted path line',
  'diff --git a/clients/Jane Example notes.md b/clients/Jane Example notes.md',
  'new file mode 100644',
  '--- /dev/null',
  `+++ b/clients/Jane Example notes.md${TAB}`,
  '@@ -0,0 +1 @@',
  '+spaced path line',
  '',
].join('\n');

describe('addedBlocks', () => {
  it('groups consecutive added lines per file with the line number they start at', () => {
    expect(addedBlocks(diff)).toEqual([
      {
        path: 'docs/notes.md',
        blocks: [
          { firstLine: 4, text: 'first added\nsecond added' },
          { firstLine: 12, text: '++counter starts with two pluses' },
        ],
      },
      { path: 'new.txt', blocks: [{ firstLine: 1, text: 'no trailing newline' }] },
      { path: 'docs/café "q".md', blocks: [{ firstLine: 7, text: 'quoted path line' }] },
      {
        path: 'clients/Jane Example notes.md',
        blocks: [{ firstLine: 1, text: 'spaced path line' }],
      },
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(addedBlocks('')).toEqual([]);
  });

  it('marks a file whose added lines hold NUL bytes (UTF-16, archives) as binary, with its blob ids', () => {
    const binaryDiff = [
      'diff --git a/leads.csv b/leads.csv',
      `index ${OLD}..${NEW} 100644`,
      '--- a/leads.csv',
      '+++ b/leads.csv',
      '@@ -1 +1,2 @@',
      `-${NUL}n${NUL}a${NUL}m${NUL}e`,
      `+${NUL}J${NUL}a${NUL}n${NUL}e`,
      `+${NUL}E${NUL}x`,
      'diff --git a/added.bin b/added.bin',
      'new file mode 100644',
      `index ${'0'.repeat(40)}..${NEW}`,
      '--- /dev/null',
      '+++ b/added.bin',
      '@@ -0,0 +1 @@',
      `+PK${NUL}${NUL}`,
    ].join('\n');
    expect(addedBlocks(binaryDiff)).toEqual([
      { path: 'leads.csv', blocks: [], binary: true, newBlob: NEW, oldBlobs: [OLD] },
      { path: 'added.bin', blocks: [], binary: true, newBlob: NEW, oldBlobs: [null] },
    ]);
  });
});

describe('addedInAll', () => {
  const fileDiff = (oldBlob, firstLine, lines) =>
    [
      'diff --git a/m.md b/m.md',
      `index ${oldBlob}..${NEW} 100644`,
      '--- a/m.md',
      '+++ b/m.md',
      `@@ -0,0 +${firstLine},${lines.length} @@`,
      ...lines.map((l) => `+${l}`),
    ].join('\n');

  it('keeps only lines added against every parent', () => {
    expect(addedInAll([fileDiff(OLD, 1, ['a', 'b', 'c']), fileDiff(OTHER, 2, ['b', 'c'])])).toEqual(
      [{ path: 'm.md', blocks: [{ firstLine: 2, text: 'b\nc' }] }],
    );
  });

  it('passes a binary file through with the old blob of every parent', () => {
    expect(addedInAll([fileDiff(OLD, 1, [`${NUL}x`]), fileDiff(OTHER, 1, [`${NUL}x`])])).toEqual([
      { path: 'm.md', blocks: [], binary: true, newBlob: NEW, oldBlobs: [OLD, OTHER] },
    ]);
  });

  it('with one diff, is addedBlocks', () => {
    expect(addedInAll([diff])).toEqual(addedBlocks(diff));
  });
});

describe('addedLineBlocks', () => {
  it('returns the lines of the new text that the old text lacks, grouped with line numbers', () => {
    expect(
      addedLineBlocks('keep\nnew one\nnew two\nkeep 2\nnew three\n', ['keep\nkeep 2\n']),
    ).toEqual([
      { firstLine: 2, text: 'new one\nnew two' },
      { firstLine: 5, text: 'new three' },
    ]);
  });

  it('counts repeated lines, and treats no old text as a new file', () => {
    expect(addedLineBlocks('x\r\nx\r\n', ['x\r\n'])).toEqual([{ firstLine: 2, text: 'x' }]);
    expect(addedLineBlocks('a\nb', [])).toEqual([{ firstLine: 1, text: 'a\nb' }]);
  });

  it('with several old texts, keeps a line only when it is new against all of them', () => {
    expect(addedLineBlocks('a\nb\nc', ['a', 'b'])).toEqual([{ firstLine: 3, text: 'c' }]);
  });
});
