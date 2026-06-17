/** @internal — not part of @hirobius/design-system public API surface. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(__dirname, '../public/assets/_incoming/patterns');
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const PIXELMATCH_THRESHOLD = 0.1;
const VISUAL_DIFF_PERCENT_THRESHOLD = 0.001;
const FOUNDATION_DIFF_PERCENT_THRESHOLD = 0.05;
const FOUNDATION_REFERENCE_BASE_URL = process.env.HDS_GOLD_STANDARD_URL || 'https://hirobius.io';
const FOUNDATION_CANDIDATE_BASE_URL = process.env.HDS_VISUAL_LOCAL_URL || 'http://127.0.0.1:5200';
const FOUNDATION_ROUTES = ['/hds/typography', '/hds/color'];

function getUsageMessage() {
  return [
    '❌ Error: Please provide a reference URL or use --foundation-parity.',
    'Foundation parity: node scripts/visual-ingest.mjs --foundation-parity',
    'Example capture: pnpm run visual-ingest https://hirobius.io/hds/overview',
    'Example diff: pnpm run visual-ingest https://hirobius.io/hds/overview http://127.0.0.1:5200/hds/overview',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    foundationParity: false,
    positional: [],
  };

  for (const arg of argv) {
    if (arg === '--foundation-parity') {
      options.foundationParity = true;
      continue;
    }

    options.positional.push(arg);
  }

  return options;
}

function routeSlug(route) {
  const normalized = route.replace(/^\//, '').replace(/[^\w-]+/g, '-');
  return normalized || 'root';
}

function getArtifactPaths(slug) {
  return {
    reference: path.resolve(ARTIFACT_DIR, `ingested-${slug}-reference.png`),
    candidate: path.resolve(ARTIFACT_DIR, `ingested-${slug}-candidate.png`),
    diff: path.resolve(ARTIFACT_DIR, `ingested-${slug}-diff.png`),
  };
}

async function capture(page, targetUrl, outputPath, label) {
  console.log(`👁️  Capturing ${label}: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function createDiff(referencePath, candidatePath, diffPath) {
  const [referenceBuffer, candidateBuffer] = await Promise.all([
    readFile(referencePath),
    readFile(candidatePath),
  ]);

  const reference = PNG.sync.read(referenceBuffer);
  const candidate = PNG.sync.read(candidateBuffer);

  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `Screenshot dimensions differ. Reference ${reference.width}x${reference.height}; candidate ${candidate.width}x${candidate.height}.`,
    );
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  const diffPixels = pixelmatch(reference.data, candidate.data, diff.data, reference.width, reference.height, {
    threshold: PIXELMATCH_THRESHOLD,
    diffColor: [255, 0, 153],
    diffColorAlt: [255, 0, 153],
    alpha: 0.7,
    diffMask: false,
    includeAA: false,
  });

  await writeFile(diffPath, PNG.sync.write(diff));

  const totalPixels = reference.width * reference.height;
  const diffRatio = diffPixels / totalPixels;
  return {
    diffPixels,
    totalPixels,
    diffRatio,
  };
}

function startLocalServer() {
  return spawn(
    PNPM,
    ['exec', 'vite', '--host', '127.0.0.1', '--port', '5200', '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    },
  );
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {}

    await wait(500);
  }

  throw new Error(`Visual parity server did not start in time at ${baseUrl}`);
}

function stopServer(server) {
  if (!server || server.killed) {
    return;
  }

  server.kill('SIGTERM');
}

async function runDiffPair(page, referenceUrl, candidateUrl, slug, threshold) {
  const paths = getArtifactPaths(slug);

  await capture(page, referenceUrl, paths.reference, `${slug} reference`);
  await capture(page, candidateUrl, paths.candidate, `${slug} candidate`);

  const diffReport = await createDiff(paths.reference, paths.candidate, paths.diff);
  const diffPercent = (diffReport.diffRatio * 100).toFixed(3);

  console.log(`✅ Reference captured to ${paths.reference}`);
  console.log(`✅ Candidate captured to ${paths.candidate}`);
  console.log(`🩷 Diff map written to ${paths.diff}`);
  console.log(`📏 Visual diff: ${diffReport.diffPixels}/${diffReport.totalPixels} pixels (${diffPercent}%)`);

  return {
    ...diffReport,
    diffPercent,
    exceedsThreshold: diffReport.diffRatio > threshold,
  };
}

async function createBrowserPage() {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  // Force reduced motion to ensure a static, clean snapshot for the AI
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 1000 },
  });

  const page = await context.newPage();

  return { browser, page };
}

async function runFoundationParity() {
  const server = startLocalServer();
  const { browser, page } = await createBrowserPage();
  let exitCode = 0;

  try {
    await waitForServer(FOUNDATION_CANDIDATE_BASE_URL);

    const failures = [];

    for (const route of FOUNDATION_ROUTES) {
      const slug = routeSlug(route);
      const referenceUrl = `${FOUNDATION_REFERENCE_BASE_URL}${route}`;
      const candidateUrl = `${FOUNDATION_CANDIDATE_BASE_URL}${route}`;
      const diffReport = await runDiffPair(page, referenceUrl, candidateUrl, slug, FOUNDATION_DIFF_PERCENT_THRESHOLD);

      if (diffReport.exceedsThreshold) {
        failures.push({ route, diffPercent: diffReport.diffPercent });
      }
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`❌ Visual drift exceeded 5% on ${failure.route} (${failure.diffPercent}%).`);
      }
      exitCode = 1;
    }

    if (exitCode === 0) {
      console.log('✅ Foundation visual parity is within the 5% threshold for Typography and Color.');
    }
  } catch (error) {
    console.error('❌ Capture failed:', error);
    exitCode = 1;
  } finally {
    stopServer(server);
    await browser.close();
  }

  if (exitCode !== 0) {
    process.exit(1);
  }
}

async function ingest() {
  const options = parseArgs(process.argv.slice(2));

  if (options.foundationParity) {
    await runFoundationParity();
    return;
  }

  const [referenceUrl, candidateUrl] = options.positional;

  if (!referenceUrl) {
    console.error(getUsageMessage());
    process.exit(1);
  }

  const { browser, page } = await createBrowserPage();
  let exitCode = 0;

  try {
    const slug = routeSlug(new URL(referenceUrl).pathname || 'reference');
    const paths = getArtifactPaths(slug);

    if (candidateUrl) {
      const diffReport = await runDiffPair(page, referenceUrl, candidateUrl, slug, VISUAL_DIFF_PERCENT_THRESHOLD);

      if (diffReport.exceedsThreshold) {
        console.error(`❌ Visual regression exceeded 0.1% tolerance (${diffReport.diffPercent}%).`);
        exitCode = 1;
      }
      if (exitCode === 0) {
        console.log('✅ Visual diff is within the 0.1% tolerance threshold.');
      }
    } else {
      await capture(page, referenceUrl, paths.reference, 'reference');
      console.log(`✅ Reference captured to ${paths.reference}`);
      console.log('🤖 Workflow ready: capture a local candidate URL as the second argument to generate a neon-pink diff map.');
    }
  } catch (error) {
    console.error('❌ Capture failed:', error);
    exitCode = 1;
  } finally {
    await browser.close();
  }

  if (exitCode !== 0) {
    process.exit(1);
  }
}

ingest().catch((error) => {
  console.error(error);
  process.exit(1);
});
