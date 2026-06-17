/**
 * Static pre-render script.
 *
 * Run after `vite build` + `vite build --ssr src/entry-server.tsx`:
 *   node scripts/prerender.mjs
 *
 * For each public route, renders the page to an HTML string, injects it
 * into dist/index.html (replacing the empty <div id="root">), swaps in
 * per-page <title>/<meta> tags, and writes a route-specific HTML file so
 * Vercel serves fully-populated HTML before any JS executes.
 *
 * Cleans up the .ssr-cache/ server bundle after completion.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const SSR_CACHE = join(ROOT, '.ssr-cache');

// ── Browser global polyfills ───────────────────────────────────────────────
// Required for ThemeContext (osPrefersDark already guarded), HDSDocPrimitives
// (useIsMobile already guarded), and any other component that touches
// window/localStorage in a useState initializer rather than useEffect.
// useEffect never runs during renderToString, so we only need init-time shims.
//
// NOTE: document is intentionally NOT polyfilled. Components that call
// createPortal guard with `if (typeof document === 'undefined') return null`
// — polyfilling document bypasses those guards and causes React SSR to throw
// "Portals are not currently supported by the server renderer."

const noop = () => {};
const mockStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver;

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  scrollY: 0,
  scrollTo: noop,
  addEventListener: noop,
  removeEventListener: noop,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  location: { pathname: '/', search: '', hash: '' },
  localStorage: mockStorage,
  ResizeObserver: MockResizeObserver,
};
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: null },
    writable: true,
  });
} catch {
  /* already defined */
}

// ── Route table ───────────────────────────────────────────────────────────

const SITE_ORIGIN = 'https://adrianmilsap.com';

const ROUTES = [
  {
    url: '/',
    outFile: 'index.html',
    title: 'Adrian Milsap — Design Engineer',
    description:
      'Design engineer specializing in design systems, component architecture, and creative engineering. 8+ years at Microsoft building Xbox and Microsoft Game Developer design systems.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/microsoft-design-systems',
    outFile: 'microsoft-design-systems/index.html',
    title: 'Microsoft Design Systems — Adrian Milsap',
    description:
      'How Adrian Milsap led design system work across Xbox and Microsoft Game Developer studios — scalable token-based component architecture used by 200+ designers and engineers.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'article',
  },
  {
    url: '/case-studies/hirobius',
    outFile: 'case-studies/hirobius/index.html',
    title: 'Hirobius Design System — Adrian Milsap',
    description:
      'Building a self-governing design system from scratch: token architecture, automated audit pipelines, multi-brand theming, and AI-assisted component generation.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'article',
  },
  {
    url: '/visuals',
    outFile: 'visuals/index.html',
    title: 'Visual Design — Adrian Milsap',
    description: 'Motion design, generative art, and visual design work by Adrian Milsap.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/case-studies/the-ranch-foundation',
    outFile: 'case-studies/the-ranch-foundation/index.html',
    title: 'The Ranch Foundation — Adrian Milsap',
    description:
      'Hirobius design and automation work for The Ranch Foundation — a nonprofit serving communities in the Pacific Northwest.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'article',
  },
  {
    url: '/info',
    outFile: 'info/index.html',
    title: 'Info — Adrian Milsap',
    description:
      'About Adrian Milsap — design engineer, builder of design systems, and creative technologist.',
    ogImage: '/assets/adrian.webp',
    ogType: 'website',
  },
  {
    url: '/vibe-sketchbook/logo-lab',
    outFile: 'vibe-sketchbook/logo-lab/index.html',
    title: 'Logo Lab — Vibe Sketchbook — Adrian Milsap',
    description:
      'Interactive logo-lab sketch: exploratory typography and form-making experiments from the Vibe Sketchbook.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/vibe-sketchbook/particle-tunnel',
    outFile: 'vibe-sketchbook/particle-tunnel/index.html',
    title: 'Particle Tunnel — Vibe Sketchbook — Adrian Milsap',
    description:
      'Interactive particle-tunnel sketch: GPU-accelerated motion experiments from the Vibe Sketchbook.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/vibe-sketchbook/morph-tiles',
    outFile: 'vibe-sketchbook/morph-tiles/index.html',
    title: 'Morph Tiles — Vibe Sketchbook — Adrian Milsap',
    description:
      'Interactive morph-tiles sketch: grid-based morphing animations from the Vibe Sketchbook.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/vibe-sketchbook/kinetic-type',
    outFile: 'vibe-sketchbook/kinetic-type/index.html',
    title: 'Kinetic Type — Vibe Sketchbook — Adrian Milsap',
    description:
      'Interactive kinetic-type sketch: motion typography studies from the Vibe Sketchbook.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
  {
    url: '/vibe-sketchbook/three-scene',
    outFile: 'vibe-sketchbook/three-scene/index.html',
    title: 'Three Scene — Vibe Sketchbook — Adrian Milsap',
    description:
      'Interactive Three.js scene: 3D composition and shader experiments from the Vibe Sketchbook.',
    ogImage: '/assets/xds-overview.webp',
    ogType: 'website',
  },
];

// ── HTML helpers ──────────────────────────────────────────────────────────

function injectIntoShell(shell, routeMeta, bodyHtml) {
  const { url, title, description, ogImage, ogType, noindex } = routeMeta;
  const canonical = `${SITE_ORIGIN}${url === '/' ? '' : url}`;
  const absOgImage = `${SITE_ORIGIN}${ogImage}`;

  let html = shell;

  // Replace <title> — works whether the shell is a fresh Vite build or a
  // previous prerender (Vite's HTML pipeline strips comment markers, so we
  // can't rely on them surviving into dist/).
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

  // Strip any previously-injected per-route meta tags (idempotent across re-runs)
  html = html
    .replace(/\n?\s*<meta name="robots"[^>]*>/g, '')
    .replace(/\n?\s*<meta name="description"[^>]*>/g, '')
    .replace(/\n?\s*<link rel="canonical"[^>]*>/g, '')
    .replace(/\n?\s*<meta property="og:[^"]*"[^>]*>/g, '')
    .replace(/\n?\s*<meta name="twitter:[^"]*"[^>]*>/g, '');

  // Inject fresh meta block immediately before </head>
  const metaBlock = [
    noindex ? `    <meta name="robots" content="noindex" />` : null,
    `    <meta name="description" content="${description}" />`,
    `    <link rel="canonical" href="${canonical}" />`,
    `    <meta property="og:type" content="${ogType}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:image" content="${absOgImage}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:site_name" content="Adrian Milsap" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${absOgImage}" />`,
  ]
    .filter(Boolean)
    .join('\n');
  html = html.replace('</head>', `${metaBlock}\n  </head>`);

  // Inject pre-rendered body into #root
  html = html.replace(
    /<div id="root"><\/div>|<div id="root">[\s\S]*?<\/div>(?=\s*<script)/,
    `<div id="root">${bodyHtml}</div>`,
  );

  return html;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const serverBundle = join(SSR_CACHE, 'entry-server.js');
  if (!existsSync(serverBundle)) {
    console.error(`SSR bundle not found: ${serverBundle}`);
    console.error('Run `vite build --ssr src/entry-server.tsx --outDir .ssr-cache` first.');
    process.exit(1);
  }

  const { render } = await import(serverBundle);

  const shell = readFileSync(join(DIST, 'index.html'), 'utf8');

  for (const route of ROUTES) {
    let bodyHtml = '';
    try {
      bodyHtml = render(route.url);
    } catch (err) {
      console.warn(`⚠  render() failed for ${route.url}: ${err.message}. Writing shell-only HTML.`);
    }

    const html = injectIntoShell(shell, route, bodyHtml);
    const outPath = join(DIST, route.outFile);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');
    console.log(`✓  ${route.url}  →  dist/${route.outFile}`);
  }

  // Clean up server bundle — not needed at runtime, shouldn't be served
  rmSync(SSR_CACHE, { recursive: true, force: true });
  console.log('✓  Cleaned .ssr-cache');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
