#!/usr/bin/env node
// ensure-build-data-files — guarantees the gitignored runtime log files that the
// ops dashboard imports at build time (`?raw`) exist before `vite build` runs.
//
// These `.jsonl` logs are appended at runtime by telemetry / guardrail tooling
// and are intentionally gitignored, so a fresh checkout (local CI or Vercel)
// does not carry them. Vite's static `?raw` imports fail hard if the file is
// absent. We create an empty file when missing — `parseJsonl` treats an empty
// string as zero entries, so widgets degrade to an empty state rather than
// breaking the build. Existing (non-empty) logs are never touched.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Directories that hold only gitignored generated output, so they do not exist
// in a clean checkout (local CI or Vercel). The generators run right after this
// script and writeFileSync into them — which fails with ENOENT if the parent
// directory is missing. Create them up front.
const REQUIRED_DIRS = ['src/app/data', 'docs/guardrails', 'telemetry'];

for (const rel of REQUIRED_DIRS) {
  const abs = resolve(ROOT, rel);
  if (existsSync(abs)) continue;
  mkdirSync(abs, { recursive: true });
  console.log(`[ensure-build-data-files] created directory ${rel}`);
}

const REQUIRED_LOG_FILES = ['docs/guardrails/firing-log.jsonl', 'telemetry/events.jsonl'];

for (const rel of REQUIRED_LOG_FILES) {
  const abs = resolve(ROOT, rel);
  if (existsSync(abs)) continue;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '');
  console.log(`[ensure-build-data-files] created empty ${rel}`);
}
