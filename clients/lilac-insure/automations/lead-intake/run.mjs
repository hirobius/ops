#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootConfig, loadWorkflowConfig, checkEnvKeys } from '../_shared/config-loader.mjs';
import { logEvent } from '../_shared/log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = loadRootConfig();
const wf = loadWorkflowConfig(HERE);
const envChecks = wf.systemsTouched.map(s => checkEnvKeys(s, root));

logEvent(root, {
  event: 'dry-run',
  workflow: wf.id,
  intendedRecipient: root.testRecipient,
  intent: 'POST /applicants from a Gravity Forms webhook payload',
  envChecks,
});

console.log(`[${wf.id}] mode=${root.mode} dry-run logged → ${root.logPath}`);
for (const c of envChecks) {
  const flag = c.missing.length === 0 ? 'ok' : `missing ${c.missing.join(',')}`;
  console.log(`  ${c.system}: ${flag} (${c.status})`);
}
process.exit(0);
