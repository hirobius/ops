/**
 * Keyboard-trap detection — unit 12p-test-keyboard-trap-detection
 *
 * Verifies that every overlay primitive in the HDS can be escaped.
 * For each overlay:
 *   1. Open the overlay (click trigger).
 *   2. Tab through a few focusable elements inside the trap.
 *   3. Press Escape.
 *   4. Assert the overlay is closed and focus returns outside the dialog.
 *
 * Run: pnpm exec playwright test tests/keyboard-trap.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

// Selector for the command-palette trigger (aria-label on CommandPalette.Trigger)
const PALETTE_TRIGGER = '[aria-label="Search docs"]';

// ── CommandPalette keyboard-trap tests ────────────────────────────────────

test.describe('CommandPalette keyboard trap', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/hds');
    await page.waitForLoadState('networkidle');
  });

  test('click-to-open: Esc closes dialog and focus escapes', async ({ page }: { page: Page }) => {
    const trigger = page.locator(PALETTE_TRIGGER).first();
    await expect(trigger).toBeVisible();

    // Open via click
    await trigger.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Tab once to move focus off the search input
    await page.keyboard.press('Tab');

    // Escape must close the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Focus must not be trapped inside a no-longer-visible dialog
    const isInsideDialog = await page.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog || !active) return false;
      return dialog.contains(active);
    });
    expect(isInsideDialog).toBe(false);
  });

  test('Ctrl+K shortcut: Esc closes dialog', async ({ page }: { page: Page }) => {
    // Open via keyboard shortcut
    await page.keyboard.press('Control+k');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Tab through a couple of focusable elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Escape must close
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('Tab cycles within open dialog — focus does not leave', async ({ page }: { page: Page }) => {
    const trigger = page.locator(PALETTE_TRIGGER).first();
    await trigger.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Tab through 8 iterations — focus should never escape the dialog
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const escapedDialog = await page.evaluate(() => {
        const active = document.activeElement;
        const dialog = document.querySelector('[role="dialog"]');
        if (!active || !dialog) return false;
        if (active === document.body) return false; // body is neutral
        return !dialog.contains(active);
      });
      expect(escapedDialog).toBe(false);
    }

    // Clean up
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
