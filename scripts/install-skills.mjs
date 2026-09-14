#!/usr/bin/env node
/**
 * scripts/install-skills.mjs
 *
 * Installer for skills-lock.json. Fetches each pinned skill's files from
 * raw.githubusercontent.com at the lock's pinnedCommit, verifies the fetched
 * bytes against computedHash (owns the canonical hash algorithm — see
 * lib/skills-lock.mjs), and writes them under `.claude/skills/<id>/`. A
 * fresh clone (or a fresh Ralph re-clone) runs this to reconstitute every
 * pinned skill; scripts/check-skills-lock.mjs is the read-only gate that
 * catches drift afterward.
 *
 * Usage:
 *   node scripts/install-skills.mjs
 *
 * Fixture mode (tests only, mirrors check-skills-lock.mjs / check-guardrail-drift.mjs):
 *   --fixture-mode with env FIXTURE_FILE=<path> substitutes the lock path,
 *   and installs into `<dirname(FIXTURE_FILE)>/.claude/skills/` instead of
 *   the real repo tree.
 *
 * Exit codes: 0 all installed · 1 one or more skills failed to install.
 *
 * @module install-skills
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadLock,
  entryFiles,
  computeHash,
  rawUrl,
  installedSkillDir,
  DEFAULT_HASH_ALGORITHM,
} from './lib/skills-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_LOCK_PATH = resolve(ROOT, 'skills-lock.json');

const FIXTURE_MODE =
  process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const FIXTURE_FILE = process.env.FIXTURE_FILE;
const LOCK_PATH = FIXTURE_MODE && FIXTURE_FILE ? resolve(FIXTURE_FILE) : REAL_LOCK_PATH;
const INSTALL_ROOT = FIXTURE_MODE && FIXTURE_FILE ? dirname(LOCK_PATH) : ROOT;

async function fetchFile(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch, verify, and write one skill. Throws with an actionable message on
 * any failure (missing pin, unsupported source, hash mismatch) — never
 * installs unverified content.
 *
 * @param {string} id
 * @param {object} entry
 * @param {string} rootDir
 */
export async function installSkill(id, entry, rootDir = ROOT) {
  if (entry.sourceType !== 'github') {
    throw new Error(
      `skill '${id}': unsupported sourceType '${entry.sourceType}' — install-skills.mjs only knows 'github'.`,
    );
  }
  if (!entry.pinnedCommit) {
    throw new Error(
      `skill '${id}': skills-lock.json has no pinnedCommit — an unpinned ref isn't reproducible. ` +
        `Fix: resolve the exact commit SHA for ${entry.source} and add "pinnedCommit": "<sha>" to ` +
        `the '${id}' entry in skills-lock.json.`,
    );
  }

  const files = entryFiles(entry);
  const fetched = [];
  for (const f of files) {
    const url = rawUrl(entry.source, entry.pinnedCommit, f.sourcePath);
    const content = await fetchFile(url);
    fetched.push({ relPath: f.relPath, content });
  }

  const algorithm = entry.hashAlgorithm || DEFAULT_HASH_ALGORITHM;
  const actual = computeHash(fetched, algorithm);
  if (actual !== entry.computedHash) {
    throw new Error(
      `skill '${id}': ${algorithm} mismatch at pinnedCommit ${entry.pinnedCommit} — expected ` +
        `${entry.computedHash}, got ${actual}. Fix: verify ${entry.source}@${entry.pinnedCommit}` +
        `#${entry.skillPath} by hand, then update skills-lock.json intentionally — do not paste in ` +
        `the new hash without checking why it changed.`,
    );
  }

  const destDir = installedSkillDir(rootDir, id);
  for (const f of fetched) {
    const dest = join(destDir, f.relPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
  }
  return { id, files: fetched.map((f) => f.relPath), dir: destDir };
}

async function main() {
  const lock = loadLock(LOCK_PATH);
  const ids = Object.keys(lock.skills);
  if (ids.length === 0) {
    console.log('install-skills: skills-lock.json has no entries — nothing to install.');
    return;
  }

  let failed = false;
  for (const id of ids) {
    try {
      const result = await installSkill(id, lock.skills[id], INSTALL_ROOT);
      console.log(`✓ ${id} — installed ${result.files.length} file(s) to ${result.dir}`);
    } catch (err) {
      failed = true;
      console.error(`✗ ${err.message}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
