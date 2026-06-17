#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * update-commit-history-cron.mjs
 *
 * Background cron job version of update-commit-history.mjs.
 * Runs once per session (not per-commit) to prevent duplicate history writes.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);
const OUTPUT_PATH = path.join(ROOT, 'src/app/data/commit-history.json');

export function updateCommitHistory() {
  try {
    const gitLogOutput = execSync(
      'git log --pretty=format:"%H|%aI|%s" -20',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    const commits = gitLogOutput
      .split('\n')
      .filter(line => line.trim())
      .map((line) => {
        const [hash, date, message] = line.split('|');
        return {
          hash: hash.substring(0, 7),
          date,
          message: message.trim(),
          displayMessage: message.trim().split('\n')[0],
        };
      });

    const data = {
      commits,
      lastUpdated: new Date().toISOString(),
      totalCommits: commits.length,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✓ Updated ${OUTPUT_PATH} with ${commits.length} recent commits`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to update commit history: ${error.message}`);
    return false;
  }
}

if (process.argv[1].endsWith('update-commit-history-cron.mjs')) {
  const success = updateCommitHistory();
  process.exit(success ? 0 : 1);
}
