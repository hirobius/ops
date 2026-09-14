/**
 * /info heading structure — a11y regression (issue #221)
 *
 * The design-system `Text` primitive renders its tag via an `as` prop
 * (e.g. `as="h1"`), so a plain grep for literal `<h1>` JSX under-reports
 * real headings — that's what produced the original "zero headings" scope
 * on this issue. Assert the rendered DOM instead: exactly one <h1>, no
 * skipped heading levels, verified with axe's heading-order rule.
 *
 * Run: pnpm exec playwright test tests/info-page-headings.spec.ts
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('info page has exactly one h1 and no heading-order violations', async ({ page }) => {
  await page.goto('/info');
  await page.waitForLoadState('networkidle');

  const h1s = page.locator('h1');
  await expect(h1s).toHaveCount(1);
  await expect(h1s.first()).toHaveText('Adrian Milsap');

  const results = await new AxeBuilder({ page }).analyze();
  const headingViolations = results.violations.filter((v) => v.id === 'heading-order');
  expect(headingViolations, JSON.stringify(headingViolations, null, 2)).toEqual([]);
});
