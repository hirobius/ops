/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-route-smoke.mjs
 *
 * Runtime route smoke test for key portfolio and HDS routes.
 * Uses the built app plus vite preview so route validation goes beyond static strings.
 *
 * Usage:
 *   pnpm build
 *   node scripts/check-route-smoke.mjs
 */

import { spawn } from 'child_process';
import { setTimeout as wait } from 'timers/promises';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE_URL = process.env.ROUTE_SMOKE_URL || `http://127.0.0.1:${PORT}`;
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const DEFAULT_ROUTES = [
  { path: '/', marker: 'Adrian Milsap portfolio home' },
  { path: '/vibe-sketchbook', marker: null },  // immersive canvas route — verify renders without errors
  { path: '/hds', marker: 'Neutral palette' },
  { path: '/hds/case-studies/hirobius', marker: 'Hirobius' },
  { path: '/microsoft-design-systems', marker: 'Building a Unified Xbox Ecosystem' },
  { path: '/visuals', marker: 'Visual Design' },
  { path: '/portfolio/draft', marker: 'Xbox Design System' },
];

// Caller can pass one or more paths after `--` to smoke-test only those
// routes. The script then asserts that #root renders without console errors
// (no marker required) — useful for newly-added doc pages whose final copy
// is still in flux.
const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const ROUTES = passthroughArgs.length > 0
  ? passthroughArgs.map((path) => ({ path, marker: null }))
  : DEFAULT_ROUTES;

function startPreview() {
  return spawn(PNPM, ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {}
    await wait(500);
  }

  throw new Error('vite preview did not start in time');
}

const shouldStartPreview = !process.env.ROUTE_SMOKE_URL;
const preview = shouldStartPreview ? startPreview() : null;
let stderr = '';

preview?.stderr.on('data', chunk => {
  stderr += chunk.toString();
});

try {
  await waitForServer();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(`Console error on ${page.url()}: ${message.text()}`);
    }
  });

  for (const route of ROUTES) {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#root');

    if (route.marker) {
      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes(route.marker)) {
        throw new Error(`Route smoke failed for ${route.path} — expected marker "${route.marker}" not found.`);
      }
    }
  }

  await browser.close();

  if (consoleErrors.length > 0) {
    throw new Error(consoleErrors[0]);
  }

  console.log('\n✓ Runtime route smoke passed — key built routes render expected content in a browser.\n');
} catch (error) {
  console.error('\n✗ Runtime route smoke failed.\n');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  if (stderr.trim()) {
    console.error('\n  Preview stderr:');
    console.error(stderr.trim());
  }
  console.error('');
  process.exitCode = 1;
} finally {
  preview?.kill();
}
