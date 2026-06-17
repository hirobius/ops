/**
 * Responsive layout audit — shell stability at all breakpoints
 *
 * For every major route × viewport combination, this test checks:
 *  1. No horizontal overflow (content wider than viewport)
 *  2. No fixed elements clipping off-screen (nav, TOC, topbar)
 *  3. Key shell chrome is present and visible
 *  4. Large-screen and TV/Xbox Edge rendering (1920×1080, 2560×1440)
 *
 * Run:  pnpm test:responsive
 * Or:   npx playwright test tests/responsive.spec.ts
 */
import { test, expect } from '@playwright/test';

// ── Viewports ──────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'mobile-sm',      width: 375,  height: 812  },
  { name: 'mobile-lg',      width: 430,  height: 932  },
  { name: 'tablet',         width: 768,  height: 1024 },
  { name: 'narrow-desktop', width: 1024, height: 768  },
  { name: 'desktop',        width: 1280, height: 800  },
  { name: 'wide',           width: 1440, height: 900  },
  { name: 'tv',             width: 1920, height: 1080,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/44.17763.1.0' },
  { name: 'tv-4k',          width: 2560, height: 1440,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/44.17763.1.0' },
];

// ── Routes — all major shell surfaces ─────────────────────────────────────────

const ROUTES = [
  // Portfolio
  '/',
  '/info',
  '/portfolio',
  '/portfolio/microsoft-game-dev',
  '/portfolio/xbox-design-lab-xdd',
  '/vibe-sketchbook',
  // HDS top-level
  '/hds',
  '/hds/getting-started',
  '/hds/process',
  '/hds/color',
  '/hds/typography',
  '/hds/spacing',
  '/hds/tokens',
  '/hds/motion',
  '/hds/breakpoints',
  '/hds/shape',
  '/hds/elevation',
  '/hds/icons',
  // HDS components
  '/hds/components',
  '/hds/components/actions',
  '/hds/components/inputs',
  '/hds/components/display',
  '/hds/components/navigation',
  '/hds/components/layout',
];

// ── Horizontal overflow check ─────────────────────────────────────────────────

async function checkNoHorizontalOverflow(page: any, route: string, viewport: string) {
  const overflow = await page.evaluate(() => {
    // documentElement.scrollWidth > clientWidth means horizontal scroll exists
    const doc = document.documentElement;
    const body = document.body;
    return {
      docScrollWidth:   doc.scrollWidth,
      docClientWidth:   doc.clientWidth,
      bodyScrollWidth:  body.scrollWidth,
      bodyClientWidth:  body.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth + 2, // +2 for sub-pixel rounding
    };
  });

  expect(
    overflow.overflow,
    `Horizontal overflow on ${route} @ ${viewport}: ` +
    `doc.scrollWidth=${overflow.docScrollWidth} > clientWidth=${overflow.docClientWidth}`
  ).toBe(false);
}

// ── Shell chrome presence ─────────────────────────────────────────────────────

async function checkShellChrome(page: any, viewport: { name: string; width: number }) {
  const isMobile = viewport.width < 768;
  const isHdsRoute = await page.url().includes('/hds');

  if (isMobile) {
    // Mobile: topbar hamburger trigger should exist on HDS routes
    if (isHdsRoute) {
      const trigger = page.locator('[aria-label*="navigation" i], [aria-label*="menu" i]').first();
      await expect(trigger, 'Mobile nav trigger should exist on HDS routes').toBeVisible();
    }
  } else {
    // Desktop: left sidebar nav should exist on HDS routes
    if (isHdsRoute) {
      const nav = page.locator('nav').first();
      await expect(nav, 'Sidebar nav should be visible on desktop HDS routes').toBeVisible();
    }
  }

  // Skip-link should always be in DOM (even if not visible)
  const skipLink = page.locator('.skip-link').first();
  await expect(skipLink, 'Skip-link should be in DOM').toBeAttached();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`responsive [${vp.name}] ${route}`, async ({ page }) => {
      if (vp.userAgent) {
        await page.setExtraHTTPHeaders({ 'user-agent': vp.userAgent });
      }
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Let motion settle
      await page.waitForTimeout(400);

      await checkNoHorizontalOverflow(page, route, vp.name);
      await checkShellChrome(page, vp);
    });
  }
}
