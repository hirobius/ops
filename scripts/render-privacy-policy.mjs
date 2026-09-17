#!/usr/bin/env node
/**
 * scripts/render-privacy-policy.mjs — print the public privacy policy, or the
 * CAN-SPAM email footer, ready to paste (ops#38).
 *
 * Source text: docs/prospecting/privacy-policy.md. Entity, mailing address and
 * privacy contact come from lib/compliance/identity.mjs, and the retention
 * window from lib/compliance/retention.mjs, so re-running this after editing
 * one of those modules is the whole update.
 *
 *   node scripts/render-privacy-policy.mjs --effective-date 2026-09-16   # policy, Markdown
 *   node scripts/render-privacy-policy.mjs --footer                      # email footer, plain text
 *
 * Output goes to stdout. Nothing is written or published.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSpamFooter, renderPrivacyPolicy } from '../lib/compliance/policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'docs/prospecting/privacy-policy.md');

function parseArgs(argv) {
  const o = { effectiveDate: null, footer: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--effective-date') o.effectiveDate = argv[++i];
    else if (a === '--footer') o.footer = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      console.error(`Unknown argument "${a}". Run --help for usage.`);
      process.exit(1);
    }
  }
  return o;
}

function printHelp() {
  console.log(`render-privacy-policy.mjs — print the privacy policy or the CAN-SPAM footer.

Usage:
  node scripts/render-privacy-policy.mjs --effective-date <YYYY-MM-DD>
  node scripts/render-privacy-policy.mjs --footer

Flags:
  --effective-date <d>  The date printed on the policy. Required for the policy.
  --footer              Print the outreach email footer instead (for the Smartlead template).
  --help, -h            This message.

To change the entity, address or privacy contact, edit lib/compliance/identity.mjs.
`);
}

const o = parseArgs(process.argv.slice(2));
if (o.help) {
  printHelp();
} else if (o.footer) {
  process.stdout.write(`${canSpamFooter()}\n`);
} else {
  try {
    process.stdout.write(
      renderPrivacyPolicy(readFileSync(TEMPLATE, 'utf8'), { effectiveDate: o.effectiveDate }),
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error('Example: node scripts/render-privacy-policy.mjs --effective-date 2026-09-16');
    process.exitCode = 1;
  }
}
