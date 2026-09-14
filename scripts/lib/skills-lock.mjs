/**
 * scripts/lib/skills-lock.mjs
 *
 * Shared helpers for skills-lock.json — the pin file for skills vendored
 * from outside this repo, installed under `.claude/skills/<id>/`. Consumed
 * by scripts/install-skills.mjs (fetch + verify + write) and
 * scripts/check-skills-lock.mjs (the read-only drift gate).
 *
 * Lock schema, per skill id:
 *   source        "<owner>/<repo>" GitHub source
 *   sourceType    "github" (the only type install-skills.mjs knows)
 *   skillPath     path to the skill's SKILL.md within the source repo
 *   pinnedCommit  exact commit SHA to fetch from — required to install;
 *                 an unpinned branch ref isn't reproducible
 *   paths         optional extra file paths (relative to skillPath's
 *                 directory) for multi-file skills, e.g. ["mocking.md"]
 *   hashAlgorithm optional, defaults to 'sha256'
 *   computedHash  hex digest verified against the fetched/installed content
 *
 * Hash convention: a single-file skill (no `paths`) hashes the raw bytes of
 * skillPath directly. A multi-file skill hashes each file's
 * "<relPath>\0<bytes>" concatenated in relPath-sorted order, so adding,
 * removing, or renaming a file changes the hash even when the remaining
 * bytes are untouched.
 *
 * @module skills-lock
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const DEFAULT_HASH_ALGORITHM = 'sha256';
export const SKILLS_INSTALL_DIR = '.claude/skills';

/**
 * @param {string} lockPath
 * @returns {{version: number, skills: Record<string, object>}}
 */
export function loadLock(lockPath) {
  const raw = readFileSync(lockPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.skills !== 'object' ||
    parsed.skills === null
  ) {
    throw new Error(`${lockPath}: expected a { skills: {...} } object`);
  }
  return parsed;
}

/**
 * The ordered set of (relPath, sourcePath) pairs a lock entry covers:
 * skillPath's file first, then any declared `paths`, all relative to the
 * skill's own directory. Sorted by relPath for a deterministic hash
 * regardless of declaration order.
 *
 * @param {object} entry
 * @returns {{relPath: string, sourcePath: string}[]}
 */
export function entryFiles(entry) {
  const skillDir = posix.dirname(entry.skillPath);
  const skillFileName = posix.basename(entry.skillPath);
  const extra = Array.isArray(entry.paths) ? entry.paths : [];
  const files = [
    { relPath: skillFileName, sourcePath: entry.skillPath },
    ...extra.map((p) => ({ relPath: p, sourcePath: posix.join(skillDir, p) })),
  ];
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return files;
}

/**
 * @param {{relPath: string, content: Buffer}[]} files
 * @param {string} [algorithm]
 * @returns {string} hex digest
 */
export function computeHash(files, algorithm = DEFAULT_HASH_ALGORITHM) {
  const hash = createHash(algorithm);
  if (files.length === 1) {
    hash.update(files[0].content);
    return hash.digest('hex');
  }
  const sorted = [...files].sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const f of sorted) {
    hash.update(f.relPath);
    hash.update('\0');
    hash.update(f.content);
  }
  return hash.digest('hex');
}

/**
 * @param {string} source "<owner>/<repo>"
 * @param {string} ref commit SHA (or branch, for manual debugging only)
 * @param {string} sourcePath path within the source repo
 */
export function rawUrl(source, ref, sourcePath) {
  return `https://raw.githubusercontent.com/${source}/${ref}/${sourcePath}`;
}

export function installedSkillDir(rootDir, id) {
  return join(rootDir, SKILLS_INSTALL_DIR, id);
}

/**
 * Read the on-disk files for an installed skill and verify them against the
 * lock entry. Never touches the network — this is what the check-skills-lock
 * gate calls.
 *
 * @param {string} rootDir repo root (contains .claude/skills/)
 * @param {string} id skill id (lock key)
 * @param {object} entry lock entry
 * @returns {{ok: true, dir: string} | {ok: false, reason: 'missing', missing: string[], dir: string} | {ok: false, reason: 'hash-mismatch', actual: string, expected: string, algorithm: string, dir: string}}
 */
export function verifyInstalled(rootDir, id, entry) {
  const dir = installedSkillDir(rootDir, id);
  const files = entryFiles(entry);
  const missing = [];
  const contents = [];
  for (const f of files) {
    const abs = join(dir, f.relPath);
    if (!existsSync(abs)) {
      missing.push(f.relPath);
      continue;
    }
    contents.push({ relPath: f.relPath, content: readFileSync(abs) });
  }
  if (missing.length > 0) {
    return { ok: false, reason: 'missing', missing, dir };
  }
  const algorithm = entry.hashAlgorithm || DEFAULT_HASH_ALGORITHM;
  const actual = computeHash(contents, algorithm);
  const expected = entry.computedHash;
  if (actual !== expected) {
    return { ok: false, reason: 'hash-mismatch', actual, expected, algorithm, dir };
  }
  return { ok: true, dir };
}
