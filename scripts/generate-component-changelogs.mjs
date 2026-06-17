#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-component-changelogs.mjs
 *
 * Generates public/component-changelogs.json by cross-referencing each
 * component slug in src/app/data/component-api.json with git log history.
 *
 * For each component, walks `git log --follow` on the component's source
 * file and collects commit entries (date, short hash, subject).
 *
 * Output schema:
 * {
 *   "generatedAt": "<ISO-8601>",
 *   "changelogs": {
 *     "<slug>": [
 *       { "date": "YYYY-MM-DD", "hash": "<short-sha>", "subject": "<msg>" },
 *       ...
 *     ]
 *   }
 * }
 *
 * Usage:
 *   node scripts/generate-component-changelogs.mjs
 *
 * Wire into manifest:generate by running alongside it:
 *   Add "docs:changelogs": "node scripts/generate-component-changelogs.mjs"
 *   to package.json scripts.
 *
 * Exit codes:
 *   0 — success
 *   1 — fatal error
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPONENT_API_PATH = join(ROOT, 'src', 'app', 'data', 'component-api.json');
const OUTPUT_PATH = join(ROOT, 'public', 'component-changelogs.json');

/**
 * Read and parse component-api.json.
 * @returns {{ components: Record<string, { filePath: string }> }}
 */
function readComponentApi() {
  try {
    return JSON.parse(readFileSync(COMPONENT_API_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Error reading component-api.json: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Get git log entries for a specific file path using --follow to track renames.
 * @param {string} filePath - relative path from repo root
 * @returns {Array<{ date: string, hash: string, subject: string }>}
 */
function getFileHistory(filePath) {
  try {
    const output = execSync(
      `git log --follow --pretty=format:"%H|%ad|%s" --date=short -- "${filePath}"`,
      {
        encoding: 'utf-8',
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (!output.trim()) return [];

    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [sha, date, ...subjectParts] = line.split('|');
        const subject = subjectParts.join('|'); // rejoin in case subject has pipes
        return {
          date: date.trim(),
          hash: sha.slice(0, 7),
          subject: subject.trim(),
        };
      })
      .filter((entry) => entry.date && entry.hash && entry.subject);
  } catch {
    // Silently return empty for files with no history (new or untracked)
    return [];
  }
}

/**
 * Main entry point.
 */
function main() {
  const apiData = readComponentApi();
  const components = apiData.components || {};

  const slugs = Object.keys(components);
  if (slugs.length === 0) {
    console.error('No components found in component-api.json');
    process.exit(1);
  }

  console.log(`Processing ${slugs.length} components...`);

  const changelogs = {};
  let totalEntries = 0;

  for (const slug of slugs) {
    const component = components[slug];
    const filePath = component.filePath;

    if (!filePath) {
      console.warn(`  ⚠ ${slug}: no filePath — skipping`);
      changelogs[slug] = [];
      continue;
    }

    const history = getFileHistory(filePath);
    changelogs[slug] = history;
    totalEntries += history.length;

    if (history.length > 0) {
      console.log(`  ✓ ${slug}: ${history.length} commit(s)`);
    } else {
      console.log(`  · ${slug}: no history`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    changelogs,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(`\n✓ wrote public/component-changelogs.json (${slugs.length} components, ${totalEntries} total entries)`);
  process.exit(0);
}

main();
