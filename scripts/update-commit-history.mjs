#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Generate recent commit history for HistoryCard consumption.
 * Runs automatically on post-commit hook to keep the history feed fresh.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);
const OUTPUT_PATH = path.join(ROOT, 'src/app/data/commit-history.json');

// Fetch last 20 commits with formatting
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
      hash: hash.substring(0, 7), // Short hash
      date,
      message: message.trim(),
      displayMessage: message.trim().split('\n')[0], // First line only
    };
  });

// Write to data file for component consumption
const data = {
  commits,
  lastUpdated: new Date().toISOString(),
  totalCommits: commits.length,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');

console.log(`✓ Updated ${OUTPUT_PATH} with ${commits.length} recent commits`);
