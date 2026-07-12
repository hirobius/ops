/**
 * Tests for resolve-playwright-browser.mjs — the BS1a env-detection resolver.
 * Pure function, injectable env + existence probe (no real fs).
 */

import { describe, it, expect } from 'vitest';
import { resolveChromiumExecutable } from '../lib/resolve-playwright-browser.mjs';

const exists = (set) => (p) => set.has(p);

describe('resolveChromiumExecutable', () => {
  it('returns undefined when no pre-installed browser is present (CI/local)', () => {
    const r = resolveChromiumExecutable({ env: {}, exists: exists(new Set()) });
    expect(r).toBeUndefined();
  });

  it('resolves the stable symlink under PLAYWRIGHT_BROWSERS_PATH', () => {
    const r = resolveChromiumExecutable({
      env: { PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' },
      exists: exists(new Set(['/opt/pw-browsers/chromium'])),
    });
    expect(r).toBe('/opt/pw-browsers/chromium');
  });

  it('falls back to the documented default path when the env var is unset', () => {
    const r = resolveChromiumExecutable({
      env: {},
      exists: exists(new Set(['/opt/pw-browsers/chromium'])),
    });
    expect(r).toBe('/opt/pw-browsers/chromium');
  });

  it('honors an explicit PLAYWRIGHT_CHROMIUM_EXECUTABLE override', () => {
    const r = resolveChromiumExecutable({
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE: '/custom/chrome',
        PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers',
      },
      exists: exists(new Set(['/custom/chrome', '/opt/pw-browsers/chromium'])),
    });
    expect(r).toBe('/custom/chrome');
  });

  it('ignores a non-existent explicit override and continues probing', () => {
    const r = resolveChromiumExecutable({
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE: '/gone',
        PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers',
      },
      exists: exists(new Set(['/opt/pw-browsers/chromium'])),
    });
    expect(r).toBe('/opt/pw-browsers/chromium');
  });

  it('prefers the env-declared browsers path over the hardcoded default', () => {
    const r = resolveChromiumExecutable({
      env: { PLAYWRIGHT_BROWSERS_PATH: '/custom/browsers' },
      exists: exists(new Set(['/custom/browsers/chromium', '/opt/pw-browsers/chromium'])),
    });
    expect(r).toBe('/custom/browsers/chromium');
  });
});
