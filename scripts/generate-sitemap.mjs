#!/usr/bin/env node

/**
 * generate-sitemap.mjs
 *
 * Generates public/sitemap.xml from the route list derived from the
 * component registry and static routes (via derive-routes.mjs).
 *
 * Usage: node scripts/generate-sitemap.mjs
 *
 * Output: public/sitemap.xml — standard XML sitemap per sitemaps.org spec.
 * Wire into: pnpm build (post-build step) or pnpm manifest:generate.
 *
 * Routes excluded:
 *   - Parameter routes (:id, :slug)
 *   - Internal-only routes prefixed with /admin, /dev, /internal
 *   - Duplicate double-slash routes (//)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const BASE_URL = process.env.SITEMAP_BASE_URL || 'https://adrianmilsap.com';
const OUTPUT_PATH = path.join(rootDir, 'public', 'sitemap.xml');

// Routes to exclude from the sitemap
const EXCLUDE_PREFIXES = ['/admin', '/dev', '/internal', '/debug'];
const EXCLUDE_EXACT = new Set(['//']);

function deriveRoutes() {
  try {
    const output = execSync('node scripts/derive-routes.mjs', {
      cwd: rootDir,
      encoding: 'utf8',
    });
    return JSON.parse(output);
  } catch (err) {
    throw new Error('Failed to derive routes: ' + err.message);
  }
}

function filterRoutes(routes) {
  return routes.filter(r => {
    if (!r || EXCLUDE_EXACT.has(r)) return false;
    if (r.includes(':')) return false; // parameter routes
    if (EXCLUDE_PREFIXES.some(p => r.startsWith(p))) return false;
    return true;
  });
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function buildSitemap(routes) {
  const today = formatDate(new Date());
  const urlEntries = routes.map(route => {
    // Priority: homepage highest, HDS design system pages high, others normal
    let priority = '0.5';
    let changefreq = 'monthly';

    if (route === '/') {
      priority = '1.0';
      changefreq = 'weekly';
    } else if (route.startsWith('/hds')) {
      priority = '0.8';
      changefreq = 'weekly';
    } else if (route.startsWith('/case-studies')) {
      priority = '0.7';
      changefreq = 'monthly';
    }

    return [
      '  <url>',
      `    <loc>${BASE_URL}${route}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    '</urlset>',
    '',
  ].join('\n');
}

// Main
const allRoutes = deriveRoutes();
const filteredRoutes = filterRoutes(allRoutes);

const sitemap = buildSitemap(filteredRoutes);
fs.writeFileSync(OUTPUT_PATH, sitemap, 'utf8');

console.log(`Sitemap generated: ${OUTPUT_PATH} (${filteredRoutes.length} URLs)`);
