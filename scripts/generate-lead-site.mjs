#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-lead-site.mjs — generate a client site with NO API spend.
 *
 * The metered path (`api/lead-action.ts` action 'generate' → lib/agent) bills
 * ANTHROPIC_API_KEY tokens per lead. This path doesn't call the API at all: a
 * Claude Code session authors the content JSON on the operator's subscription,
 * and this script runs it through the same gates and emits the same hand-off.
 *
 * It is deliberately dumb — no LLM, no Supabase, no network (except optional
 * Pexels). That keeps it free, offline-testable, and impossible to run up a bill.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/generate-lead-site.mjs --lead lead.json --content content.json
 *   node scripts/generate-lead-site.mjs --lead lead.json --content content.json --out ./out
 *   node scripts/generate-lead-site.mjs --schema        # print the content shape
 *
 * With --out, writes <out>/client.config.ts and <out>/deploy-commands.sh.
 * Without it, prints both to stdout for copy-paste.
 *
 * ── Stock photos (optional, free) ────────────────────────────────────────────
 * With PEXELS_API_KEY set, --photos fetches 1 hero + 4 gallery images for a lead
 * with none and includes the download block. Without the key it says so and
 * proceeds — imagery is not worth failing a generation over.
 *
 * Exit codes: 0 generated · 1 content rejected by a gate · 2 invocation error.
 *
 * @module generate-lead-site
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFromContent } from '../lib/agent/manual-generate.mjs';
import { searchStockPhotos, tradeQuery, MissingPexelsKeyError } from '../lib/photos/pexels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

/** The content shape a session must author. Printed by --schema. */
const CONTENT_SHAPE = `{
  "palettePreset": "landscaping | junk-removal | pressure-washing | concrete-fencing",
  "palette": {
    "primary": "#rrggbb", "accent": "#rrggbb", "bg": "#rrggbb",
    "fg": "#rrggbb", "muted": "#rrggbb", "onPrimary": "#rrggbb"
  },
  "heroVariant": "classic | split-card | banner",
  "sectionOrder": ["services", "gallery", "reviews", "serviceAreaMap", "contact"],
  "font": "system | ...",
  "heroHeadline": "Names the service AND the city. <= 60 chars.",
  "heroSub": "One sentence on the promise.",
  "ctaLabel": "e.g. Get a Free Quote",
  "about": "Short paragraph. NO invented facts.",
  "serviceAreas": ["City"],
  "services": [{ "title": "...", "description": "One sentence." }],
  "reviews": [],
  "seoTitle": "<= 70 chars, includes city.",
  "seoDescription": "<= 180 chars."
}

RULES THE GATES ENFORCE (a violation is rejected, not warned):
  - palette must NOT equal a stock preset — derive it from the trade and locale
  - primary/onPrimary, fg/bg and fg/muted must each clear WCAG AA 4.5:1
  - sectionOrder must be all five ids, no duplicates
  - heroVariant cannot be 'video' (no video asset; the build gate fails an empty one)
  - reviews: [] unless grounded in the lead's real data — fabrication ban`;

if (argv.includes('--schema')) {
  console.log(CONTENT_SHAPE);
  process.exit(0);
}

const leadPath = flag('--lead');
const contentPath = flag('--content');
if (!leadPath || !contentPath) {
  console.error(
    'generate-lead-site: --lead <file.json> and --content <file.json> are required.\n' +
      '      run with --schema to print the content shape a session should author.',
  );
  process.exit(2);
}

function readJson(p, label) {
  const abs = resolve(ROOT, p);
  if (!existsSync(abs)) {
    console.error(`generate-lead-site: ${label} not found at ${abs}`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`generate-lead-site: ${label} is not valid JSON — ${err.message}`);
    process.exit(2);
  }
}

const lead = readJson(leadPath, '--lead');
const content = readJson(contentPath, '--content');

// Optional free stock imagery for a lead with none.
if (argv.includes('--photos') && !(Array.isArray(lead.photos) && lead.photos.length)) {
  try {
    lead.photos = await searchStockPhotos({
      query: tradeQuery(content.palettePreset, lead.category),
      count: 5,
    });
    console.error(`generate-lead-site: fetched ${lead.photos.length} stock photo(s) from Pexels.`);
  } catch (err) {
    console.error(
      `generate-lead-site: no stock imagery — ${err.message}\n` +
        (err instanceof MissingPexelsKeyError
          ? '      proceeding without it; the site will have placeholder imagery.\n'
          : ''),
    );
  }
}

const result = buildFromContent(lead, content);

if (!result.ok) {
  console.error(`\n✗ generate-lead-site: content rejected — fix these and re-run:\n`);
  for (const n of result.notes) console.error(`  ${n}`);
  console.error(
    `\n  These are the same gates the metered pipeline enforces in its repair loop.\n`,
  );
  process.exit(1);
}

for (const n of result.notes) console.error(`⚠ ${n}`);

const outDir = flag('--out');
if (outDir) {
  const abs = resolve(ROOT, outDir);
  mkdirSync(abs, { recursive: true });
  writeFileSync(resolve(abs, 'client.config.ts'), result.artifacts.configFile);
  writeFileSync(resolve(abs, 'deploy-commands.sh'), `${result.artifacts.commands}\n`);
  console.log(`\n✓ ${result.config.slug} → ${abs}/`);
  console.log(`    client.config.ts     paste into apps/${result.config.slug}/`);
  console.log(`    deploy-commands.sh   run in hirobius/clients`);
} else {
  console.log(`\n── apps/${result.config.slug}/client.config.ts ──\n`);
  console.log(result.artifacts.configFile);
  console.log(`\n── run in hirobius/clients ──\n`);
  console.log(result.artifacts.commands);
}
