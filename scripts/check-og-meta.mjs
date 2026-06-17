#!/usr/bin/env node

/**
 * check-og-meta.mjs
 *
 * Static analysis validator for OG meta tags in index.html.
 *
 * This project is a React Router SPA with a single index.html (no per-route
 * meta tags). The validator:
 *   1. Parses index.html for <title> and <meta> tags
 *   2. Asserts title is non-empty
 *   3. Asserts og:image path exists in public/ or is an absolute URL
 *   4. Asserts description (if present) ≤ 160 chars
 *
 * Exit 0 if all checks pass, 1 if any fail.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const INDEX_HTML = 'index.html';
const PUBLIC_DIR = 'public';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

/**
 * Parse index.html and extract meta tags.
 */
function parseMetaTags() {
  const html = readFileSync(INDEX_HTML, 'utf8');

  // Extract <title>
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Extract og:image meta tag
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/);
  const ogImage = ogImageMatch ? ogImageMatch[1].trim() : '';

  // Extract description meta tag
  const descriptionMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  return { title, ogImage, description };
}

/**
 * Validate og:image path exists in public/ or is an absolute URL.
 */
function isValidOgImagePath(imagePath) {
  if (!imagePath) return false;

  // Check if absolute URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return true;
  }

  // Check if file exists in public/
  const fullPath = join(PUBLIC_DIR, imagePath.startsWith('/') ? imagePath.slice(1) : imagePath);
  return existsSync(fullPath);
}

/**
 * Main validation logic.
 */
function main() {
  let hasErrors = false;
  const errors = [];

  const { title, ogImage, description } = parseMetaTags();

  // Check: title non-empty
  if (!title) {
    errors.push('TITLE_BLANK: <title> is empty');
    hasErrors = true;
  }

  // Check: og:image exists and is valid
  if (!ogImage) {
    errors.push('OGIMAGE_MISSING: og:image meta tag not found');
    hasErrors = true;
  } else if (!isValidOgImagePath(ogImage)) {
    errors.push(`OGIMAGE_NOT_FOUND: og:image path "${ogImage}" does not exist in public/ or is not a valid URL`);
    hasErrors = true;
  }

  // Check: description ≤ 160 chars
  if (description && description.length > 160) {
    errors.push(`DESCRIPTION_TOO_LONG: description is ${description.length} chars (max 160 allowed)`);
    hasErrors = true;
  }

  // Output
  if (hasErrors) {
    log(colors.red, '✗ index.html meta validation failed:');
    errors.forEach(err => log(colors.red, `  • ${err}`));
    process.exit(1);
  } else {
    const titleLen = title.length;
    const descLen = description.length;
    const ogImageStatus = ogImage ? '✓' : '✗';
    const descStatus = description ? `${descLen} chars` : '(not set)';
    log(colors.green, `✓ index.html meta validation passed:`);
    log(colors.green, `  • title: "${title}" (${titleLen} chars)`);
    log(colors.green, `  • og:image: ${ogImageStatus} ${ogImage}`);
    log(colors.green, `  • description: ${descStatus}`);
    process.exit(0);
  }
}

main();
