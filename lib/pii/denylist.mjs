/**
 * lib/pii/denylist — parse and load the PII denylist.
 *
 * The denylist holds the names, mailboxes, domains and identifiers of real
 * clients and contacts, so it is itself PII and NEVER lives in the repo
 * (ops#27). It is supplied at runtime from one or both of:
 *
 *   - the PII_DENYLIST environment variable (the GitHub Actions secret), and
 *   - a gitignored `.pii-denylist` file at the repo root (local commits).
 *
 * When both exist their entries are merged, so a local file can be ahead of
 * the secret without weakening either.
 *
 * FORMAT: one entry per line. `#` starts a comment line; blank lines are
 * ignored. Every other line is ONE regular expression, matched
 * case-insensitively (a plain literal is just a regex with no metacharacters).
 * Keep to the ECMAScript/RE2 common subset: no lookaround, no backreferences,
 * no inline flags.
 *
 * Entries are identified by their LINE NUMBER in the source, never by their
 * text, so every message about an entry is safe to print in a public CI log.
 *
 * @module pii/denylist
 */

import { join } from 'node:path';

/** Gitignored local denylist file, relative to the repo root. */
export const DENYLIST_FILE = '.pii-denylist';

/** Environment variable (and GitHub Actions secret) holding the denylist. */
export const DENYLIST_ENV = 'PII_DENYLIST';

/**
 * @typedef {object} DenylistEntry
 * @property {number} index   1-based line number in the source text
 * @property {string} source  where it came from: 'PII_DENYLIST', '.pii-denylist', 'fixture', or 'inline' (default)
 * @property {RegExp} regex   compiled, case-insensitive, global
 */

/**
 * Parse denylist text into compiled entries.
 *
 * An entry that fails to compile, or that matches the empty string (it would
 * match everywhere), is reported in `invalid` by line number and skipped.
 *
 * @param {string} text
 * @param {{ source?: string }} [options]
 * @returns {{ entries: DenylistEntry[], invalid: { index: number, source: string, reason: string }[] }}
 */
export function parseDenylist(text, options = {}) {
  const source = options.source ?? 'inline';
  const entries = [];
  const invalid = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const index = i + 1;
    let regex;
    try {
      regex = new RegExp(line, 'gi');
    } catch {
      invalid.push({ index, source, reason: 'is not a valid regular expression' });
      return;
    }
    regex.lastIndex = 0;
    if (regex.test('')) {
      invalid.push({
        index,
        source,
        reason: 'matches the empty string, so it would match everywhere',
      });
      return;
    }
    regex.lastIndex = 0;
    entries.push({ index, source, regex });
  });
  return { entries, invalid };
}

/**
 * Load the denylist from the environment variable and the local file.
 *
 * I/O is injected so the merge rules are testable; scripts pass `readFile`
 * backed by node:fs that returns null for a missing file.
 *
 * `roots` are tried in order and the FIRST `.pii-denylist` found is used —
 * pass the current checkout first and the main checkout second, so a
 * `.claude/worktrees/*` session picks up the one file kept at the main root.
 *
 * An entry that appears in both sources (compared case-insensitively) is
 * kept once, from the first source, so one hit is never reported twice.
 *
 * @param {object} options
 * @param {Record<string, string|undefined>} options.env
 * @param {string[]} options.roots                     directories that may hold `.pii-denylist`
 * @param {(path: string) => string|null} options.readFile
 * @returns {{ entries: DenylistEntry[], invalid: { index: number, source: string, reason: string }[], sources: string[] }}
 */
export function loadDenylist({ env, roots, readFile }) {
  const entries = [];
  const invalid = [];
  const sources = [];
  const seen = new Set();

  const add = (text, source) => {
    if (typeof text !== 'string' || text.trim() === '') return;
    const parsed = parseDenylist(text, { source });
    sources.push(source);
    for (const entry of parsed.entries) {
      const key = entry.regex.source.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
    invalid.push(...parsed.invalid);
  };

  add(env?.[DENYLIST_ENV], DENYLIST_ENV);
  for (const root of new Set(roots)) {
    const text = readFile(join(root, DENYLIST_FILE));
    if (text !== null && text !== undefined) {
      add(text, DENYLIST_FILE);
      break;
    }
  }

  return { entries, invalid, sources };
}
