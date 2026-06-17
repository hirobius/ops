#!/usr/bin/env node
/**
 * email-triage runner.
 *
 * Modes:
 *   (default)            — log dry-run intent + env-key check, exit 0
 *   --classify <file>    — classify a fixture file, print result JSON
 *   --classify-stdin     — read thread JSON from stdin, print result JSON
 *                          (used by n8n Execute Command node)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootConfig, loadWorkflowConfig, checkEnvKeys } from '../_shared/config-loader.mjs';
import { logEvent } from '../_shared/log.mjs';
import { classify, loadCategories } from './classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === '--classify' && args[1]) {
  const fixture = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const result = classify(fixture);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

if (args[0] === '--classify-stdin') {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => buf += c);
  process.stdin.on('end', () => {
    const thread = JSON.parse(buf);
    const result = classify(thread);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  });
} else {
  const root = loadRootConfig();
  const wf = loadWorkflowConfig(HERE);
  const cats = loadCategories();
  const envChecks = wf.systemsTouched.map(s => checkEnvKeys(s, root));

  logEvent(root, {
    event: 'dry-run',
    workflow: wf.id,
    intendedRecipient: root.testRecipient,
    intent: 'classify Outlook thread + apply Graph category',
    categoryCount: cats.categories.length,
    categories: cats.categories.map(c => c.id),
    envChecks,
  });

  console.log(`[${wf.id}] mode=${root.mode} dry-run logged → ${root.logPath}`);
  console.log(`  loaded ${cats.categories.length} categories: ${cats.categories.map(c => c.id).join(', ')}`);
  for (const c of envChecks) {
    const flag = c.missing.length === 0 ? 'ok' : `missing ${c.missing.join(',')}`;
    console.log(`  ${c.system}: ${flag} (${c.status})`);
  }
  process.exit(0);
}
