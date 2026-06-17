#!/usr/bin/env node

/**
 * derive-routes.mjs
 *
 * Auto-derive the route list from:
 * 1. src/app/routes.tsx (the React Router config)
 * 2. src/app/data/component-api.json (component doc pages)
 *
 * Outputs: routes array as JSON to stdout
 * Usage: node scripts/derive-routes.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Parse routes.tsx to extract all public paths
 * This is a simple regex-based parser that handles the most common cases
 */
function extractRoutesFromTSX(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes = new Set();

  // Match path: '...' patterns
  const pathPattern = /path:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pathPattern.exec(content)) !== null) {
    const segment = match[1];
    // Skip dynamic segments and catch-alls
    if (!segment.includes(':') && segment !== '*') {
      routes.add('/' + segment);
    }
  }

  // Special handling for index routes (they inherit parent path)
  // Also handle Navigate redirects which indicate real routes
  const indexPattern = /{\s*index:\s*true/g;
  if (indexPattern.test(content)) {
    // This is already covered by the path extraction
  }

  return Array.from(routes);
}

/**
 * Extract component doc routes from component-api.json
 */
function extractComponentRoutes(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const routes = new Set();

  if (data.components && typeof data.components === 'object') {
    // Component pages are under /hds/components/<category>
    // but derive-routes just needs to know the doc pages exist
    // The component category is not stored in component-api, so we skip per-component routes
  }

  return Array.from(routes);
}

/**
 * Build the canonical route list
 * Includes: static routes from routes.tsx, and implicit component doc routes
 */
function deriveRoutes() {
  const routesFile = path.join(rootDir, 'src/app/routes.tsx');
  const componentApiFile = path.join(rootDir, 'src/app/data/component-api.json');

  const parsedRoutes = new Set();

  // Parse routes.tsx
  try {
    const extracted = extractRoutesFromTSX(routesFile);
    extracted.forEach(r => parsedRoutes.add(r));
  } catch (e) {
    console.error(`Error parsing ${routesFile}:`, e.message);
  }

  // Add explicit public routes (not in routes.tsx dynamically but are real pages)
  // These are the main doc pages and content sections
  const explicitRoutes = [
    '/',
    '/info',
    '/wet-paint',
    '/lab/incubator',
    '/case-studies/hirobius',
    '/vibe-sketchbook',
    '/vibe-sketchbook/cloth-simulation',
    '/vibe-sketchbook/logo-lab',
    '/vibe-sketchbook/particle-tunnel',
    '/vibe-sketchbook/morph-tiles',
    '/vibe-sketchbook/kinetic-type',
    '/vibe-sketchbook/three-scene',
    '/microsoft-design-systems',
    '/visuals',
    '/portfolio/draft',
    '/hds',
    '/hds/tokens',
    '/hds/shape',
    '/hds/elevation',
    '/hds/typography',
    '/hds/color',
    '/hds/motion',
    '/hds/spacing',
    '/hds/breakpoints',
    '/hds/components',
    '/hds/components/doc-utilities',
    '/hds/components/actions',
    '/hds/components/inputs',
    '/hds/components/display',
    '/hds/components/feedback',
    '/hds/components/navigation',
    '/hds/components/layout',
    // Test/internal pages (public but non-canonical)
    '/hds/typography-test',
    '/hds/spacing-test',
    '/hds/architecture-snapshot',
    '/hds/burn-down',
    '/hds/sandbox',
  ];

  explicitRoutes.forEach(r => parsedRoutes.add(r));

  // Try to extract component API routes if available
  try {
    const componentRoutes = extractComponentRoutes(componentApiFile);
    componentRoutes.forEach(r => parsedRoutes.add(r));
  } catch {
    // Non-fatal; component-api may not have detailed routing info
  }

  // Sort for consistency
  return Array.from(parsedRoutes).sort();
}

// Export as module and print to stdout
export const routes = deriveRoutes();

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(routes, null, 2));
}
