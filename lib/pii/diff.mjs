/**
 * lib/pii/diff — extract the ADDED text from a unified diff.
 *
 * The PII gate scans what a commit or pull request adds, not the whole tree:
 * a finding already on main must never block an unrelated change (the ops#27
 * history rewrite is still pending, so main itself carries known hits).
 *
 * Expects `git diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/`
 * output; scripts/check-pii.mjs passes those flags so user config
 * (diff.noprefix, color.diff, external diff drivers) cannot change the shape.
 * Consecutive added lines are joined into one block, so a denylisted name
 * wrapped across two lines is still one match.
 *
 * @module pii/diff
 */

/**
 * @typedef {object} AddedFile
 * @property {string} path
 * @property {{ firstLine: number, text: string }[]} blocks
 */

/**
 * @param {string} diffText
 * @returns {AddedFile[]}
 */
export function addedBlocks(diffText) {
  /** @type {AddedFile[]} */
  const files = [];
  let current = null;
  let inHunk = false;
  let newLine = 0;
  let lastAdded = -1;

  for (const rawLine of String(diffText ?? '').split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.startsWith('diff --git ')) {
      current = null;
      inHunk = false;
      continue;
    }

    if (!inHunk) {
      if (line.startsWith('+++ ')) {
        const path = parseDiffPath(line.slice(4));
        current = path === null ? null : { path, blocks: [] };
        if (current) files.push(current);
      } else if (line.startsWith('@@ ')) {
        inHunk = true;
        newLine = hunkNewStart(line);
        lastAdded = -1;
      }
      continue;
    }

    if (line.startsWith('@@ ')) {
      newLine = hunkNewStart(line);
      lastAdded = -1;
    } else if (line.startsWith('+')) {
      if (current) {
        const text = line.slice(1);
        const block = current.blocks.at(-1);
        if (block && lastAdded === newLine - 1) block.text += `\n${text}`;
        else current.blocks.push({ firstLine: newLine, text });
      }
      lastAdded = newLine;
      newLine += 1;
    } else if (line.startsWith(' ')) {
      newLine += 1;
    }
    // '-' (removed) and '\' (no newline marker) do not advance the new side.
  }

  return files.filter((f) => f.blocks.length > 0);
}

/**
 * Lines added in BOTH diffs, where both diffs share the same new side (e.g.
 * the index against HEAD, and the index against MERGE_HEAD). For a merge
 * commit that is what the merge itself introduces: a conflict resolution or an
 * evil-merge edit — not the lines either parent already carried.
 *
 * @param {string} diffA
 * @param {string} diffB
 * @returns {AddedFile[]}
 */
export function addedInBoth(diffA, diffB) {
  const inB = new Map();
  for (const file of addedBlocks(diffB)) inB.set(file.path, addedLineNumbers(file));
  const result = [];
  for (const file of addedBlocks(diffA)) {
    const keep = inB.get(file.path);
    if (!keep) continue;
    const kept = { path: file.path, blocks: [] };
    for (const block of file.blocks) {
      block.text.split('\n').forEach((text, i) => {
        const lineNo = block.firstLine + i;
        if (!keep.has(lineNo)) return;
        const last = kept.blocks.at(-1);
        if (last && last.firstLine + last.text.split('\n').length === lineNo)
          last.text += `\n${text}`;
        else kept.blocks.push({ firstLine: lineNo, text });
      });
    }
    if (kept.blocks.length > 0) result.push(kept);
  }
  return result;
}

function addedLineNumbers(file) {
  const lines = new Set();
  for (const block of file.blocks) {
    const count = block.text.split('\n').length;
    for (let i = 0; i < count; i++) lines.add(block.firstLine + i);
  }
  return lines;
}

/** New-side start line from a hunk header `@@ -a,b +c,d @@`. */
function hunkNewStart(header) {
  const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  return m ? Number(m[1]) : 0;
}

/** Path from a `+++` header value; null for /dev/null. */
function parseDiffPath(value) {
  if (value === '/dev/null') return null;
  const unquoted = value.startsWith('"') ? unquoteC(value) : value;
  return unquoted.startsWith('b/') ? unquoted.slice(2) : unquoted;
}

/** Git's C-style path quoting: \" \\ \t \n and \ooo octal bytes (UTF-8). */
function unquoteC(quoted) {
  const body = quoted.slice(1, quoted.endsWith('"') ? -1 : undefined);
  const bytes = [];
  const SIMPLE = { n: 10, t: 9, r: 13, '"': 34, '\\': 92, a: 7, b: 8, f: 12, v: 11 };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[i + 1];
    if (/[0-7]/.test(next ?? '')) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(SIMPLE[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
