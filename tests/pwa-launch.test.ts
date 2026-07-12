/**
 * PWA launch integrity — guards the "add to home screen" path.
 *
 * The installed web app launches at manifest.start_url with no address bar;
 * if that path ever falls through to the router's `*` catch-all, every launch
 * opens on the 404 page (the 2026-07 regression: start_url pointed at the
 * retired /ops/sessions route). These tests pin manifest + service-worker
 * shell paths to routes the real router actually serves, and require the
 * manifest icons to exist as PNGs (Chrome's install criteria reject .ico).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { matchRoutes } from 'react-router';
import { router } from '@/app/routes';

const publicDir = resolve(__dirname, '../public');
const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf8'));
const swSource = readFileSync(resolve(publicDir, 'sw.js'), 'utf8');

/** True when the router serves `path` with a real route, not the `*` catch-all. */
function servedByRealRoute(path: string): boolean {
  const matches = matchRoutes(router.routes, path);
  if (!matches || matches.length === 0) return false;
  const leaf = matches[matches.length - 1];
  return leaf.route.path !== '*';
}

describe('web app manifest', () => {
  it('start_url resolves to a real route (not the 404 catch-all)', () => {
    expect(manifest.start_url, 'manifest.start_url must be set').toBeTruthy();
    expect(
      servedByRealRoute(manifest.start_url),
      `start_url "${manifest.start_url}" falls through to NotFoundPage — the installed app would open on a 404`,
    ).toBe(true);
  });

  it('start_url is inside the manifest scope', () => {
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it('declares standalone display so the launch looks like an app', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('icons are PNGs that exist in public/ (install criteria reject .ico)', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(icon.type, `icon ${icon.src} must be image/png`).toBe('image/png');
      const file = resolve(publicDir, `.${icon.src}`);
      expect(existsSync(file), `manifest icon missing on disk: ${icon.src}`).toBe(true);
      // PNG magic bytes — catches a renamed/corrupt file lying about its type.
      const header = readFileSync(file).subarray(0, 8);
      expect(
        header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        `${icon.src} is not a real PNG`,
      ).toBe(true);
    }
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});

describe('service worker app shell', () => {
  const shellMatch = swSource.match(/const APP_SHELL\s*=\s*\[([^\]]*)\]/);

  it('declares an APP_SHELL list', () => {
    expect(shellMatch, 'sw.js must declare APP_SHELL').toBeTruthy();
  });

  it('every pre-cached navigation path resolves to a real route', () => {
    const paths = [...shellMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      if (path === '/index.html') continue; // physical file, not a route
      expect(
        servedByRealRoute(path),
        `sw.js pre-caches "${path}" which falls through to NotFoundPage — offline fallback would serve a 404 shell`,
      ).toBe(true);
    }
  });

  it('pre-caches the start_url so the installed app opens offline', () => {
    const paths = [...shellMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(paths).toContain(manifest.start_url);
  });
});

describe('index.html install links', () => {
  const indexHtml = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('links the manifest', () => {
    expect(indexHtml).toContain('rel="manifest"');
  });

  it('declares an apple-touch-icon that exists (iOS home-screen icon)', () => {
    const match = indexHtml.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
    expect(match, 'index.html must link an apple-touch-icon').toBeTruthy();
    expect(existsSync(resolve(publicDir, `.${match![1]}`))).toBe(true);
  });
});
