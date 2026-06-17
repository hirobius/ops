#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
import { existsSync, watchFile, unwatchFile } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-roadmap-data.mjs');
const SOURCE_FILES = [
  'TASKS.md',
  'BACKLOG.md',
  'IDEAS.md',
  'public/hds-manifest.json',
  'docs/SYSTEMS-LOG.md',
].map((relativePath) => join(ROOT, relativePath)).filter((path) => existsSync(path));

let scheduledBuild = null;
let rebuilding = false;

function toRelativePath(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;
}

function runBuild(reason) {
  rebuilding = true;
  console.log(`\n[roadmap] rebuilding (${reason})`);

  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  rebuilding = false;

  if (result.status !== 0) {
    const exitCode = typeof result.status === 'number' ? result.status : 1;
    console.error(`[roadmap] rebuild failed with exit code ${exitCode}`);
  }
}

function scheduleBuild(reason) {
  if (scheduledBuild) {
    clearTimeout(scheduledBuild);
  }

  scheduledBuild = setTimeout(() => {
    scheduledBuild = null;
    runBuild(reason);
  }, 150);
}

function watchSource(path) {
  watchFile(path, { interval: 1000 }, (curr, prev) => {
    if (rebuilding) return;
    if (curr.mtimeMs === prev.mtimeMs) return;
    scheduleBuild(toRelativePath(path));
  });
}

function shutdown() {
  if (scheduledBuild) {
    clearTimeout(scheduledBuild);
    scheduledBuild = null;
  }

  for (const path of SOURCE_FILES) {
    unwatchFile(path);
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

console.log('[roadmap] watching source files');
for (const path of SOURCE_FILES) {
  console.log(`  - ${toRelativePath(path)}`);
  watchSource(path);
}

runBuild('startup');
