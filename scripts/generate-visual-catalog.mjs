/** @internal — not part of @hirobius/design-system public API surface. */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../docs/visual-catalog');
const BASE_URL = (process.env.VISUAL_CATALOG_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const MAX_RETRIES = 3;
const VIEWPORT = { width: 1440, height: 1080 };

const ROUTES = [
  { label: 'Overview', path: '/hds', slug: 'overview' },
  { label: 'Token Explorer', path: '/hds/tokens', slug: 'token-explorer' },
  { label: 'Color', path: '/hds/color', slug: 'color' },
  { label: 'Typography', path: '/hds/typography', slug: 'typography' },
  { label: 'Spacing', path: '/hds/spacing', slug: 'spacing' },
  { label: 'Shape', path: '/hds/shape', slug: 'shape' },
  { label: 'Elevation', path: '/hds/elevation', slug: 'elevation' },
  { label: 'Motion', path: '/hds/motion', slug: 'motion' },
  { label: 'Breakpoints', path: '/hds/breakpoints', slug: 'breakpoints' },
  { label: 'Actions', path: '/hds/components/actions', slug: 'actions' },
  { label: 'Inputs', path: '/hds/components/inputs', slug: 'inputs' },
  { label: 'Layout', path: '/hds/components/layout', slug: 'layout' },
];

function isRecoverableError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return [
    'Target page, context or browser has been closed',
    'Navigation failed because page crashed',
    'net::ERR',
    'NS_ERROR',
    'Timeout',
  ].some((pattern) => message.includes(pattern));
}

function buildFilename(index, slug) {
  return `${String(index + 1).padStart(2, '0')}-${slug}.png`;
}

async function waitForVisualReady(page) {
  await page.waitForSelector('#root');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(async () => {
    if ('fonts' in document && document.fonts?.ready) {
      await document.fonts.ready;
    }

    const pendingImages = Array.from(document.images).filter((image) => !image.complete);
    await Promise.all(
      pendingImages.map((image) => new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })),
    );
  });
  await page.waitForTimeout(500);
}

async function captureRoute(browser, route, index) {
  const filename = buildFilename(index, route.slug);
  const outputPath = path.join(OUTPUT_DIR, filename);
  const targetUrl = `${BASE_URL}${route.path}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: VIEWPORT,
    });
    const page = await context.newPage();

    try {
      console.log(`[${String(index + 1).padStart(2, '0')}/${ROUTES.length}] Capturing ${route.label} -> ${filename}`);

      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      if (!response) {
        throw new Error(`No response received for ${targetUrl}`);
      }
      if (response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} for ${targetUrl}`);
      }

      await waitForVisualReady(page);
      await page.screenshot({
        path: outputPath,
        fullPage: true,
      });

      await context.close();
      return;
    } catch (error) {
      await context.close().catch(() => {});

      if (attempt >= MAX_RETRIES || !isRecoverableError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Self-heal retry ${attempt}/${MAX_RETRIES - 1} for ${route.path}: ${message}`);
      await wait(750 * attempt);
    }
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const [index, route] of ROUTES.entries()) {
      await captureRoute(browser, route, index);
    }

    console.log(`Visual catalog complete. Screenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Visual catalog generation failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
