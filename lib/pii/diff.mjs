/**
 * lib/pii/diff — extract the ADDED text from a unified diff.
 *
 * The PII gate scans what a commit or pull request adds, not the whole tree:
 * a finding already on main must never block an unrelated change (the ops#27
 * history rewrite is still pending, so main itself carries known hits).
 *
 * Expects `git diff --no-color --no-ext-diff --text --full-index
 * --src-prefix=a/ --dst-prefix=b/` output; scripts/check-pii.mjs passes those
 * flags so user config (diff.noprefix, color.diff, external diff drivers) and
 * `.gitattributes` (`-diff`, `binary`) cannot change the shape or hide a file.
 * Consecutive added lines are joined into one block, so a denylisted name
 * wrapped across two lines is still one match.
 *
 * With `--text`, a file holding NUL bytes (UTF-16 text, images, archives) comes
 * through as byte soup split at 0x0A. Such a file is returned as `binary` with
 * its blob ids instead of blocks: the caller reads and decodes the blobs, and
 * `addedLineBlocks` finds the lines the change adds.
 *
 * @module pii/diff
 */

/**
 * @typedef {object} AddedFile
 * @property {string} path
 * @property {{ firstLine: number, text: string }[]} blocks  empty when `binary`
 * @property {true} [binary]               added lines hold NUL bytes; use the blobs
 * @property {string|null} [newBlob]       full blob id of the new side
 * @property {(string|null)[]} [oldBlobs]  old-side blob id per diff (null: file is new)
 */

/**
 * @param {string} diffText
 * @returns {AddedFile[]}
 */
export function addedBlocks(diffText) {
  const files = [];
  let current = null;
  let blobs = { oldBlob: null, newBlob: null };
  let inHunk = false;
  let newLine = 0;
  let lastAdded = -1;

  for (const rawLine of String(diffText ?? '').split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.startsWith('diff --git ')) {
      current = null;
      blobs = { oldBlob: null, newBlob: null };
      inHunk = false;
      continue;
    }

    if (!inHunk) {
      if (line.startsWith('index ')) {
        blobs = parseIndexLine(line);
      } else if (line.startsWith('+++ ')) {
        const path = parseDiffPath(line.slice(4));
        current = path === null ? null : { path, blocks: [], binary: false, ...blobs };
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
        if (text.includes('\0')) current.binary = true;
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

  return files.flatMap((f) => {
    if (f.binary) {
      return [
        { path: f.path, blocks: [], binary: true, newBlob: f.newBlob, oldBlobs: [f.oldBlob] },
      ];
    }
    return f.blocks.length > 0 ? [{ path: f.path, blocks: f.blocks }] : [];
  });
}

/**
 * Lines added in EVERY diff, where all diffs share the same new side (the
 * index or a commit against each of its parents). For a merge that is what the
 * merge itself introduces: a conflict resolution or an evil-merge edit — not
 * the lines one parent already carried.
 *
 * @param {string[]} diffTexts
 * @returns {AddedFile[]}
 */
export function addedInAll(diffTexts) {
  const [first, ...rest] = diffTexts.map((text) => addedBlocks(text));
  if (!first) return [];
  const others = rest.map((files) => new Map(files.map((f) => [f.path, f])));
  const result = [];
  for (const file of first) {
    const matches = others.map((byPath) => byPath.get(file.path));
    if (matches.some((m) => !m)) continue;

    if (file.binary) {
      result.push({
        ...file,
        oldBlobs: [...file.oldBlobs, ...matches.flatMap((m) => m.oldBlobs ?? [null])],
      });
      continue;
    }

    const keep = matches.map(addedLineNumbers);
    const kept = { path: file.path, blocks: [] };
    for (const block of file.blocks) {
      block.text.split('\n').forEach((text, i) => {
        const lineNo = block.firstLine + i;
        if (keep.some((lines) => !lines.has(lineNo))) return;
        appendLine(kept.blocks, lineNo, text);
      });
    }
    if (kept.blocks.length > 0) result.push(kept);
  }
  return result;
}

/**
 * The lines of `newText` that none of `oldTexts` has, as blocks with 1-based
 * line numbers. Repeated lines are counted, so a second copy of an existing
 * line is still added. Used for files whose diff is unusable (UTF-16): both
 * sides are decoded, then compared line by line.
 *
 * @param {string} newText
 * @param {string[]} oldTexts   one per parent; none for a new file
 * @returns {{ firstLine: number, text: string }[]}
 */
export function addedLineBlocks(newText, oldTexts) {
  const counts = oldTexts.map((old) => {
    const map = new Map();
    for (const line of splitLines(old)) map.set(line, (map.get(line) ?? 0) + 1);
    return map;
  });
  const blocks = [];
  splitLines(newText).forEach((line, i) => {
    let added = true;
    for (const map of counts) {
      const n = map.get(line) ?? 0;
      if (n > 0) {
        map.set(line, n - 1);
        added = false;
      }
    }
    if (added) appendLine(blocks, i + 1, line);
  });
  return blocks;
}

function splitLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function appendLine(blocks, lineNo, text) {
  const last = blocks.at(-1);
  if (last && last.firstLine + last.text.split('\n').length === lineNo) last.text += `\n${text}`;
  else blocks.push({ firstLine: lineNo, text });
}

function addedLineNumbers(file) {
  const lines = new Set();
  for (const block of file.blocks) {
    const count = block.text.split('\n').length;
    for (let i = 0; i < count; i++) lines.add(block.firstLine + i);
  }
  return lines;
}

/** Blob ids from `index <old>..<new>[ <mode>]`; null for the all-zero id or an abbreviated one. */
function parseIndexLine(line) {
  const m = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/.exec(line);
  const full = (id) =>
    id && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(id) && !/^0+$/.test(id) ? id : null;
  return { oldBlob: full(m?.[1]), newBlob: full(m?.[2]) };
}

/** New-side start line from a hunk header `@@ -a,b +c,d @@`. */
function hunkNewStart(header) {
  const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  return m ? Number(m[1]) : 0;
}

/**
 * Path from a `+++` header value; null for /dev/null. Git ends the header with
 * a TAB when the path contains a space. A path that really ends in a tab is
 * always C-quoted, so one trailing TAB is never part of the name.
 */
function parseDiffPath(value) {
  const header = value.endsWith('\t') ? value.slice(0, -1) : value;
  if (header === '/dev/null') return null;
  const unquoted = header.startsWith('"') ? unquoteC(header) : header;
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
