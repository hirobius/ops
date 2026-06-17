/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * page-clone.mjs — URL → HDS-compliant React JSX pipeline
 *
 * Usage:
 *   node scripts/page-clone.mjs <url> [--output <path>] [--skip-screenshot] [--help]
 *
 * Steps:
 *   1. Playwright screenshot (1440x900 full-page) → public/assets/_incoming/clone-<ts>-<slug>.png
 *   2. Base64 image + Claude API vision → identifies layout zones → outputs HDS React JSX
 *   3. Write JSX → public/assets/_incoming/clone-<ts>-<slug>.tsx
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const INCOMING_DIR = path.resolve(REPO_ROOT, 'public/assets/_incoming');
const LLMS_TXT = path.resolve(REPO_ROOT, 'public/llms.txt');

// ── CLI parsing ──────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
page-clone — URL screenshot → AI visual reconstruction → HDS-compliant React JSX

Usage:
  node scripts/page-clone.mjs <url> [options]

Arguments:
  <url>                  The page URL to clone (must start with http:// or https://)

Options:
  --output <path>        Custom output path for the .tsx file (default: public/assets/_incoming/)
  --skip-screenshot      Reuse the most recent clone-*.png in _incoming/ instead of launching browser
  --help, -h             Print this help message and exit

Examples:
  node scripts/page-clone.mjs https://example.com
  node scripts/page-clone.mjs https://stripe.com/pricing --skip-screenshot
  node scripts/page-clone.mjs https://vercel.com --output src/app/pages/CloneTest.tsx
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    url: null,
    output: null,
    skipScreenshot: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--skip-screenshot') {
      opts.skipScreenshot = true;
    } else if (arg === '--output') {
      i++;
      if (!args[i]) {
        console.error('Error: --output requires a path argument');
        process.exit(1);
      }
      opts.output = args[i];
    } else if (!arg.startsWith('--')) {
      opts.url = arg;
    } else {
      console.error(`Error: unknown flag "${arg}". Run --help for usage.`);
      process.exit(1);
    }
    i++;
  }

  return opts;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function urlToSlug(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-');
    const pathname = u.pathname.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root';
    return `${host}-${pathname}`.toLowerCase().replace(/-+/g, '-').slice(0, 64);
  } catch {
    return 'page';
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── Step 1: Screenshot ───────────────────────────────────────────────────────

async function takeScreenshot(url, pngPath) {
  console.log(`[page-clone] Taking screenshot of: ${url}`);
  console.log(`[page-clone] Viewport: 1440x900, full-page`);

  // Dynamic import so --help works without Playwright installed
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Dismiss common cookie banners
    await page.evaluate(() => {
      const selectors = [
        '[id*="cookie"] button[id*="accept"]',
        '[class*="cookie"] button[class*="accept"]',
        '[aria-label*="accept cookies"]',
        'button[data-testid*="accept"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) el.click();
      }
    }).catch(() => { /* best-effort */ });
    await page.screenshot({ path: pngPath, fullPage: true });
    console.log(`[page-clone] Screenshot saved: ${pngPath}`);
  } finally {
    await browser.close();
  }
}

async function findMostRecentClonePng() {
  ensureDir(INCOMING_DIR);
  const entries = await readdir(INCOMING_DIR);
  const clones = entries
    .filter(f => f.startsWith('clone-') && f.endsWith('.png'))
    .map(f => ({ name: f, full: path.join(INCOMING_DIR, f) }));

  if (clones.length === 0) {
    throw new Error('No clone-*.png found in public/assets/_incoming/. Run without --skip-screenshot first.');
  }

  // Sort by mtime descending
  const withStats = await Promise.all(
    clones.map(async c => ({ ...c, mtime: (await stat(c.full)).mtimeMs }))
  );
  withStats.sort((a, b) => b.mtime - a.mtime);
  const most = withStats[0];
  console.log(`[page-clone] --skip-screenshot: reusing ${most.name}`);
  return most.full;
}

// ── Step 2: Claude API vision analysis ──────────────────────────────────────

async function loadLlmsTxt() {
  try {
    return await readFile(LLMS_TXT, 'utf8');
  } catch {
    return '(public/llms.txt not found — using fallback component list)';
  }
}

function buildSystemPrompt(llmsTxt) {
  return `You are an expert front-end engineer building UI for the Hirobius Design System (HDS).

You will receive a screenshot of a web page. Your task is to:
1. Identify the visual layout zones (header, hero, content sections, cards, footer, etc.)
2. Map those zones to HDS React components
3. Output a single, complete React TypeScript page component using ONLY HDS components and HDS tokens

## HDS System Context

${llmsTxt}

## HDS Component Palette (use these, do not invent custom components)

Layout:
- Stack — vertical or horizontal flex stack. Props: direction, gap, align, justify
- Grid — CSS grid wrapper. Props: cols, gap
- Surface — semantic surface wrapper with elevation. Props: elevation, padding, radius
- Card — card surface (elevation.flat resting, elevation.raised on hover for interactive)
- HdsSection — full-width page section wrapper

Typography:
- Text — all text. Props: variant (heading1–heading6, body, bodyLarge, caption, label), color, weight, as

Interactive:
- Button — Props: variant (primary, secondary, ghost, destructive), size, leftIcon, rightIcon
- HdsLink — Props: href, variant (inline, standalone)
- Input — text input. Props: label, placeholder, type, error
- HdsSelect — dropdown. Props: label, options
- Badge — status badge. Props: label, variant (info, success, warning, error, neutral)

Navigation:
- HdsNavBar — top navigation bar
- NavItem — navigation link item
- HdsBreadcrumb — breadcrumb trail

Media:
- HdsImage — responsive image wrapper with HDS aspect ratios

## Token Rules (ALL values must use HDS tokens — no raw hex, no px values, no Tailwind classes)

Colors:
- Background: var(--semantic-color-surface-page), var(--semantic-color-surface-raised), var(--semantic-color-surface-overlay)
- Text: var(--semantic-color-content-primary), var(--semantic-color-content-secondary), var(--semantic-color-content-tertiary)
- Borders: var(--semantic-color-border-default), var(--semantic-color-border-subdued)
- Brand accent: var(--semantic-color-brand-accent)
- Feedback: var(--semantic-color-feedback-error), var(--semantic-color-feedback-success), var(--semantic-color-feedback-warning)

Spacing — use only HDS gap/padding props or these vars:
- var(--semantic-space-subgrid-xs), var(--semantic-space-subgrid-sm), var(--semantic-space-component-gap), var(--semantic-space-layout-section)

Typography — use only Text variant prop, never inline font-size/weight

## Card Rules (mandatory — every card must follow this exactly)
- Background: var(--semantic-color-surface-raised)
- Border: 1px solid var(--semantic-color-border-default)
- Radius: var(--primitive-radius-8) (8px)
- Padding: via Surface padding="component" or Card
- Shadow: none at rest; shadow.subtle on hover for interactive cards via elevation.raised
- Heading inside card: Text variant="heading3"
- Meta/subtitle: Text variant="caption" + color var(--semantic-color-content-secondary)
- NEVER: gradient backgrounds, frosted glass, glow, decorative overlays, colored backgrounds

## Output Format

Output ONLY valid React TSX. No markdown, no explanation, no code fences.
Start directly with the import statements.
The component must be a named export: export function ClonedPage() { ... }
Use descriptive placeholder text that matches the source page's content zones.

Example structure:
import { Stack, Surface, Text, Button, Grid, Card } from '@hirobius/design-system';

export function ClonedPage() {
  return (
    <Stack direction="vertical" gap="layout-section">
      {/* zones go here */}
    </Stack>
  );
}
`;
}

async function analyzeWithClaude(pngPath, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      '\nError: ANTHROPIC_API_KEY environment variable is not set.\n' +
      'Set it before running: export ANTHROPIC_API_KEY=sk-ant-...\n' +
      'See: https://console.anthropic.com/settings/keys\n'
    );
    process.exit(1);
  }

  console.log('[page-clone] Reading screenshot for vision analysis...');
  const imageData = await readFile(pngPath);
  const base64Image = imageData.toString('base64');
  const mediaType = 'image/png';

  console.log(`[page-clone] Sending to claude-sonnet-4-6 (${Math.round(base64Image.length / 1024)}KB image)...`);

  // Dynamic import — Anthropic SDK is a devDependency
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: 'Analyze this page screenshot and output the complete HDS-compliant React TSX component. Output only valid TSX code — no markdown fences, no explanation.',
          },
        ],
      },
    ],
  });

  const jsx = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();

  // Strip markdown code fences if the model included them despite instructions
  return jsx
    .replace(/^```(?:tsx?|jsx?|typescript)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}

// ── Step 3: Write output ─────────────────────────────────────────────────────

async function writeOutput(jsxContent, tsxPath) {
  const header = `/** @generated by page-clone.mjs — do not edit manually */\n/* eslint-disable */\n\n`;
  await writeFile(tsxPath, header + jsxContent + '\n', 'utf8');
  console.log(`[page-clone] JSX saved: ${tsxPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (!opts.url && !opts.skipScreenshot) {
    console.error('Error: <url> argument is required (or use --skip-screenshot to reuse the last screenshot).');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  if (opts.url && !/^https?:\/\//i.test(opts.url)) {
    console.error(`Error: URL must start with http:// or https://. Got: ${opts.url}`);
    process.exit(1);
  }

  ensureDir(INCOMING_DIR);

  const ts = timestamp();
  const slug = opts.url ? urlToSlug(opts.url) : 'reused';
  const baseName = `clone-${ts}-${slug}`;

  // Step 1 — screenshot
  let pngPath;
  if (opts.skipScreenshot) {
    pngPath = await findMostRecentClonePng();
  } else {
    pngPath = path.join(INCOMING_DIR, `${baseName}.png`);
    await takeScreenshot(opts.url, pngPath);
  }

  // Step 2 — AI analysis
  const llmsTxt = await loadLlmsTxt();
  const systemPrompt = buildSystemPrompt(llmsTxt);
  const jsx = await analyzeWithClaude(pngPath, systemPrompt);

  // Step 3 — write JSX
  const tsxPath = opts.output
    ? path.resolve(process.cwd(), opts.output)
    : path.join(INCOMING_DIR, `${baseName}.tsx`);

  await writeOutput(jsx, tsxPath);

  console.log('\n[page-clone] Done.');
  console.log(`  PNG: ${pngPath}`);
  console.log(`  TSX: ${tsxPath}`);
}

main().catch(err => {
  console.error('[page-clone] Fatal error:', err.message || err);
  process.exit(1);
});
