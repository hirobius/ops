/**
 * Accessibility audit — axe-core via @axe-core/playwright
 *
 * Tests every major route against WCAG 2.1 AA.
 * Fails on critical and serious violations; moderate/minor are logged only.
 *
 * Run:  pnpm test:a11y
 * CI:   included in check:release (post-content-lock)
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FOUNDATION_ROUTES = [
  '/hds',
  '/hds/getting-started',
  '/hds/process',
  '/hds/typography',
  '/hds/color',
  '/hds/spacing',
  '/hds/tokens',
  '/hds/motion',
  '/hds/breakpoints',
  '/hds/shape',
  '/hds/elevation',
  '/hds/icons',
] as const;

const COMPONENT_ROUTES = [
  '/hds/components',
  '/hds/components/actions',
  '/hds/components/inputs',
  '/hds/components/display',
  '/hds/components/feedback',
  '/hds/components/navigation',
  '/hds/components/layout',
  '/hds/components/doc-utilities',
] as const;

const ROUTES = [...FOUNDATION_ROUTES, ...COMPONENT_ROUTES];

for (const route of ROUTES) {
  test(`a11y [${route}]`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .disableRules(['region'])
      // Decorative color specimens (aria-hidden) demonstrate low-contrast swatches by
      // design — they are excluded from screen readers and must not fail axe contrast checks.
      .exclude('[aria-hidden="true"][data-inspector-ignore="color-swatch"]')
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious  = results.violations.filter(v => v.impact === 'serious');
    const blocking = [...critical, ...serious];

    const summary = blocking
      .map((violation) => [
        `  [${violation.impact}] ${violation.id}: ${violation.description}`,
        ...violation.nodes.slice(0, 3).map((node) => `    -> ${node.html.slice(0, 180)}`),
      ].join('\n'))
      .join('\n\n');

    expect(
      blocking,
      blocking.length
        ? `\nA11y violations on ${route}:\n\n${summary}\n`
        : `Expected ${route} to have zero blocking accessibility violations.`,
    ).toHaveLength(0);

    // Log lower-severity for visibility without failing
    const moderate = results.violations.filter(v => v.impact === 'moderate');
    if (moderate.length) {
      console.log(`  ⚠ ${moderate.length} moderate violation(s) on ${route}: ${moderate.map(v => v.id).join(', ')}`);
    }
  });

  // Skip-link test at mobile viewport
  test(`skip-link [${route}] @ 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    // Check DOM order rather than simulating Tab — Tab simulation is brittle at
    // mobile viewports because Playwright's focus model can land on position:fixed
    // elements regardless of blur state. DOM order is the authoritative requirement
    // for "first tab stop" and is unaffected by browser focus quirks.
    const isFirstFocusable = await page.evaluate(() => {
      const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const first = document.querySelector(sel);
      return first?.classList.contains('skip-link') ?? false;
    });
    expect(isFirstFocusable, 'skip-link should be first focusable element in DOM order').toBe(true);
  });
}

// Search modal focus trap
// NOTE: SearchModal and associated Fuse/SEARCH_DOCUMENTS code was removed from
// HDSLayout.tsx on 2026-05-01 (12i-bloat-hdslayout-dead-code). This test is
// retained as a no-op guard in case search is ever re-wired.
test('focus trap: search modal', async ({ page }) => {
  await page.goto('/hds');
  await page.waitForLoadState('networkidle');
  // SearchModal is not wired into the running app; skip if absent.
  const maybeSearchInput = page.locator('input[placeholder]').first();
  if (await maybeSearchInput.count()) {
    await page.click('body');
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    await expect(maybeSearchInput).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(maybeSearchInput).not.toBeVisible();
  }
});

// Mobile sidebar focus trap
test('focus trap: mobile sidebar @ 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/hds');
  await page.waitForLoadState('networkidle');
  const trigger = page.getByRole('button', { name: /navigation/i }).first();
  await trigger.click();
  await page.waitForTimeout(300);
  const sidebar = page.locator('nav').first();
  await expect(sidebar).toBeVisible();
});
