/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * batch-scan.mjs
 *
 * Visits every route on the target deployment, injects the headless scanner
 * into the live DOM, deduplicates findings, and writes one fix-prompt file
 * per route to scans/.
 *
 * Usage:
 *   pnpm scan                              # scans live Vercel
 *   pnpm scan --url=http://127.0.0.1:4173 # scans an explicit local server
 *   pnpm scan:local                        # auto-detects a common local port
 *
 * Output: scans/<route-slug>.litcoffee
 * Summary table printed to stdout when done.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('--url='))?.split('=')[1];
const routesArg = args.find(arg => arg.startsWith('--routes='))?.split('=')[1];
const localMode = args.includes('--local');

const DEFAULT_BASE_URL = 'https://adrian-milsap.vercel.app';
const LOCAL_HOST_CANDIDATES = ['127.0.0.1', 'localhost'];
const LOCAL_PORT_CANDIDATES = [4173, 5173, 5174, 4174, 5178, 3000];
const HEADLESS_SCANNER_FILE = join(__dirname, 'headless-scan.browser.js');
const TOKEN_INDEX_FILE = join(ROOT, 'src', 'app', 'design-system', 'token-usage-map.json');

const DEFAULT_ROUTES = [
  '/',
  '/info',
  '/work/xbox-design-system',
  '/work/xbox-design-system?lightbox=0',
  '/work/microsoft-game-dev',
  '/work/microsoft-game-dev?lightbox=0',
  '/work/xbox-design-lab-xdd',
  '/work/xbox-design-lab-xdd?lightbox=0',
  '/work/component-lab',
  '/work/component-lab?lightbox=0',
  '/lab',
  '/lab/particle-tunnel',
  '/hds',
  '/hds/getting-started',
  '/hds/process',
  '/hds/tokens',
  '/hds/typography',
  '/hds/color',
  '/hds/shape',
  '/hds/elevation',
  '/hds/motion',
  '/hds/spacing',
  '/hds/breakpoints',
  '/hds/components',
  '/hds/components/actions',
  '/hds/components/inputs',
  '/hds/components/display',
  '/hds/components/media',
  '/hds/components/navigation',
  '/hds/components/layout',
  '/hds/icons',
];

const ROUTES = routesArg
  ? routesArg.split(',').map(route => route.trim()).filter(Boolean)
  : DEFAULT_ROUTES;
const SCANS_DIR = join(ROOT, 'scans');

function trimTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

async function canReach(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function detectLocalBaseUrl() {
  for (const host of LOCAL_HOST_CANDIDATES) {
    for (const port of LOCAL_PORT_CANDIDATES) {
      const candidate = `http://${host}:${port}`;
      if (await canReach(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `Could not find a local app server. Tried ${LOCAL_HOST_CANDIDATES.join(', ')} on ports ${LOCAL_PORT_CANDIDATES.join(', ')}.`,
  );
}

function routeToFilename(route) {
  if (route === '/') return 'home';
  return route
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/\?/g, '-')
    .replace(/=/g, '-');
}

function deduplicate(results) {
  const hardcodedMap = new Map();
  const staleVarsMap = new Map();
  const uninventoriedMap = new Map();

  for (const violation of results.hardcoded) {
    const key = `${violation.selector}|||${violation.property}|||${violation.value}`;
    if (hardcodedMap.has(key)) hardcodedMap.get(key).count += 1;
    else hardcodedMap.set(key, { ...violation, count: 1 });
  }

  for (const violation of results.staleVars) {
    const key = `${violation.varName}|||${violation.property}`;
    if (staleVarsMap.has(key)) staleVarsMap.get(key).count += 1;
    else staleVarsMap.set(key, { ...violation, count: 1 });
  }

  for (const violation of results.uninventoried) {
    const key = `${violation.selector}|||${[...violation.properties].sort().join(',')}`;
    if (uninventoriedMap.has(key)) uninventoriedMap.get(key).count += 1;
    else uninventoriedMap.set(key, { ...violation, count: 1 });
  }

  const hardcoded = [...hardcodedMap.values()];
  const staleVars = [...staleVarsMap.values()];
  const uninventoried = [...uninventoriedMap.values()];

  return {
    hardcoded,
    staleVars,
    uninventoried,
    handoffDrift: results.handoffDrift ?? [],
    deadTokens: results.deadTokens ?? [],
    auditOkComments: results.auditOkComments ?? [],
    totalOffenders:
      hardcoded.length +
      staleVars.length +
      uninventoried.length +
      (results.handoffDrift?.length ?? 0) +
      (results.deadTokens?.length ?? 0),
    rawCounts: {
      hardcoded: results.hardcoded.length,
      staleVars: results.staleVars.length,
      uninventoried: results.uninventoried.length,
    },
  };
}

function instanceNote(count) {
  return count > 1 ? `  (x${count} instances - fix the component, fixes all)` : '';
}

function buildPrompt(route, deduped) {
  if (deduped.totalOffenders === 0) {
    return `I ran the HDS token scan on route: ${route}\nNo violations found - all checks clean.`;
  }

  const lines = [
    `I ran the HDS token scan on route: ${route}`,
    'Fix ALL of the following. Read src/app/design-system/token-usage-map.json',
    'first - it contains the downstream impact map. Fix every item in one pass.',
    '',
  ];

  const section = title => [
    '--------------------------------------------------------------',
    title,
    '--------------------------------------------------------------',
  ];

  if (deduped.hardcoded.length > 0) {
    lines.push(...section('HARDCODED VALUES - replace with HDS tokens'));
    for (const violation of deduped.hardcoded) {
      lines.push(`- Page:     ${route}${instanceNote(violation.count)}`);
      lines.push(`  Element:  ${violation.selector}`);
      lines.push(`  Property: ${violation.property}`);
      lines.push(`  Value:    ${violation.value}`);
      lines.push(`  Grep for: "${violation.value}"`);
      if (violation.suggestion) lines.push(`  Fix:      use ${violation.suggestion}`);
      lines.push('');
    }
  }

  if (deduped.staleVars.length > 0) {
    lines.push(...section('STALE VARS - update to current token names'));
    for (const violation of deduped.staleVars) {
      lines.push(`- Var:      ${violation.varName}${instanceNote(violation.count)}`);
      if (violation.kind === 'dangling-var') {
        lines.push('  Status:   DANGLING - var is referenced but not defined');
      } else {
        lines.push(`  Resolves: ${violation.actualValue}  (expected ${violation.expectedValue})`);
      }
      lines.push(`  Grep for: "${violation.varName}"`);
      lines.push(`  Element:  ${violation.selector}`);
      lines.push('');
    }
  }

  if (deduped.uninventoried.length > 0) {
    lines.push(...section('UNINVENTORIED CONTAINERS - extract to components'));
    for (const violation of deduped.uninventoried) {
      lines.push(`- Page:     ${route}${instanceNote(violation.count)}`);
      lines.push(`  Element:  ${violation.selector}  (${violation.styleCount} inline styles, no HDS component ancestor)`);
      lines.push(`  Styles:   ${violation.properties.join(', ')}`);
      lines.push('  Action:   extract to src/app/components/, document on /hds/components/* page');
      lines.push('');
    }
  }

  if (deduped.deadTokens.length > 0) {
    lines.push(...section('DEAD TOKENS - remove stale references'));
    for (const token of deduped.deadTokens) {
      lines.push(`- Token:    ${token}`);
      lines.push(`  Grep for: "${token}"`);
      lines.push('  Files:    see token-usage-map.json -> deadTokens');
      lines.push('');
    }
  }

  if (deduped.handoffDrift.length > 0) {
    lines.push(...section('DESIGN-HANDOFF DRIFT - update DESIGN-HANDOFF.md'));
    for (const drift of deduped.handoffDrift) {
      lines.push(`- Value:    ${drift.handoffValue}  in ${drift.file}`);
      lines.push('  Status:   not found in current hirobius.tokens.json');
      lines.push('  Action:   update DESIGN-HANDOFF.md to match current token values');
      lines.push('');
    }
  }

  lines.push('Refer to DESIGN-HANDOFF.md and src/app/design-system/tokens.ts for correct');
  lines.push('token names and values. All new components go in src/app/components/.');

  return lines.join('\n');
}

async function resolveBaseUrl() {
  return trimTrailingSlash(
    urlArg ??
    process.env.SCAN_URL ??
    (localMode ? await detectLocalBaseUrl() : DEFAULT_BASE_URL),
  );
}

async function main() {
  const tokenIndex = JSON.parse(readFileSync(TOKEN_INDEX_FILE, 'utf8'));
  const baseUrl = await resolveBaseUrl();

  mkdirSync(SCANS_DIR, { recursive: true });

  console.log('\nHDS Batch Token Scanner');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Routes:   ${ROUTES.length}`);
  console.log('Output:   scans/\n');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', () => {});
  page.on('pageerror', () => {});

  const summary = [];

  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`;
    const filename = `${routeToFilename(route)}.litcoffee`;
    process.stdout.write(`  ${route.padEnd(42)}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.addScriptTag({ path: HEADLESS_SCANNER_FILE });

      const rawResults = await page.evaluate(payload => {
        return window.__HDS_HEADLESS_SCAN__(payload);
      }, {
        expectedValues: tokenIndex.expectedValues,
        handoffDrift: tokenIndex.handoffDrift,
        deadTokens: tokenIndex.deadTokens,
        auditOkComments: tokenIndex.auditOkComments,
      });

      const deduped = deduplicate(rawResults);
      const content = buildPrompt(route, deduped);

      writeFileSync(join(SCANS_DIR, filename), content, 'utf8');

      const dupesSaved =
        (rawResults.hardcoded.length - deduped.hardcoded.length) +
        (rawResults.uninventoried.length - deduped.uninventoried.length);

      const tag = deduped.totalOffenders === 0
        ? 'clean'
        : `x ${deduped.totalOffenders} offenders`;

      process.stdout.write(`${tag}${dupesSaved > 0 ? `  (${dupesSaved} dupes collapsed)` : ''}\n`);
      summary.push({
        route,
        status: 'ok',
        offenders: deduped.totalOffenders,
        filename,
        breakdown: {
          hardcoded: deduped.hardcoded.length,
          staleVars: deduped.staleVars.length,
          uninventoried: deduped.uninventoried.length,
          deadTokens: deduped.deadTokens?.length ?? 0,
          handoffDrift: deduped.handoffDrift?.length ?? 0,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`x  error: ${message.split('\n')[0]}\n`);
      summary.push({ route, status: 'error', offenders: 0, error: message, breakdown: null });
    }
  }

  await browser.close();

  const totalOffenders = summary.reduce((count, result) => count + result.offenders, 0);
  const cleanRoutes = summary.filter(result => result.status === 'ok' && result.offenders === 0).length;
  const dirtyRoutes = summary.filter(result => result.offenders > 0).length;
  const errorRoutes = summary.filter(result => result.status === 'error').length;

  console.log(`\nSummary ${'-'.repeat(52)}`);
  console.log(`  Routes scanned:  ${ROUTES.length}`);
  console.log(`  Clean:           ${cleanRoutes}`);
  console.log(`  Need fixes:      ${dirtyRoutes}`);
  console.log(`  Errors:          ${errorRoutes}`);
  console.log(`  Total offenders: ${totalOffenders}`);
  console.log('  Files written:   scans/');
  console.log(`${'-'.repeat(60)}\n`);

  const summaryJson = {
    scannedAt: new Date().toISOString(),
    baseUrl,
    routes: summary.map(result => ({
      route: result.route,
      filename: result.filename ?? null,
      status: result.status,
      offenders: result.offenders,
      breakdown: result.breakdown ?? null,
    })),
    totals: {
      offenders: totalOffenders,
      clean: cleanRoutes,
      errors: errorRoutes,
    },
  };

  writeFileSync(join(SCANS_DIR, 'summary.json'), JSON.stringify(summaryJson, null, 2), 'utf8');
  console.log('  summary.json written to scans/\n');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
