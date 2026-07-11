/**
 * Accessibility audit — axe-core via @axe-core/playwright
 *
 * Tests every route this app actually serves against WCAG 2.1 AA.
 * Fails on critical and serious violations; moderate/minor are logged only.
 *
 * Run:  pnpm test:a11y
 * CI:   included in check:release (post-content-lock)
 *
 * (#54) Previously audited a `/hds/*` route matrix inherited from when this
 * repo hosted the design-system doc gallery. That gallery now lives in the
 * standalone hirobius-design-system repo (with its own a11y CI); in this app
 * `/hds/*` is a client-side redirect to /ops (src/app/routes.tsx), so the old
 * matrix was auditing the SAME /ops page under ~20 different route names.
 * Scoped down to the routes this router actually serves.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/', '/info', '/ops'] as const;

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

    const critical = results.violations.filter((v) => v.impact === 'critical');
    const serious = results.violations.filter((v) => v.impact === 'serious');
    const blocking = [...critical, ...serious];

    const summary = blocking
      .map((violation) =>
        [
          `  [${violation.impact}] ${violation.id}: ${violation.description}`,
          ...violation.nodes.slice(0, 3).map((node) => `    -> ${node.html.slice(0, 180)}`),
        ].join('\n'),
      )
      .join('\n\n');

    expect(
      blocking,
      blocking.length
        ? `\nA11y violations on ${route}:\n\n${summary}\n`
        : `Expected ${route} to have zero blocking accessibility violations.`,
    ).toHaveLength(0);

    // Log lower-severity for visibility without failing
    const moderate = results.violations.filter((v) => v.impact === 'moderate');
    if (moderate.length) {
      console.log(
        `  ⚠ ${moderate.length} moderate violation(s) on ${route}: ${moderate.map((v) => v.id).join(', ')}`,
      );
    }
  });
}

// Search modal focus trap
// NOTE: SearchModal and associated Fuse/SEARCH_DOCUMENTS code was removed from
// HDSLayout.tsx on 2026-05-01 (12i-bloat-hdslayout-dead-code). This test is
// retained as a no-op guard in case search is ever re-wired.
test('focus trap: search modal', async ({ page }) => {
  await page.goto('/ops');
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

// (#54) Dropped: skip-link sub-test and "focus trap: mobile sidebar" test.
// Both targeted DS-gallery-only patterns (HDSLayout's skip link, its mobile
// sidebar nav toggle) that don't exist in OpsShell (src/app/pages/ops/
// OpsShell.tsx has no sidebar or skip link). Testing for a feature the app
// doesn't have isn't a scoping fix — whether ops should grow either is a
// product decision, not this issue's.
