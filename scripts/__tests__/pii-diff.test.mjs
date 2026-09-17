/**
 * lib/pii/diff.mjs — turning `git diff -U0` output into the added text the PII
 * gate scans. Only ADDED lines are scanned, so content already on main never
 * blocks an unrelated commit.
 */
import { describe, it, expect } from 'vitest';
import { addedBlocks } from '../../lib/pii/diff.mjs';

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
  'diff --git "a/docs/caf\\303\\251 \\"q\\".md" "b/docs/caf\\303\\251 \\"q\\".md"',
  '--- "a/docs/caf\\303\\251 \\"q\\".md"',
  '+++ "b/docs/caf\\303\\251 \\"q\\".md"',
  '@@ -0,0 +7 @@',
  '+quoted path line',
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
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(addedBlocks('')).toEqual([]);
  });
});
