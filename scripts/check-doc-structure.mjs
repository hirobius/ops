/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-doc-structure.mjs
 *
 * Validates structural invariants of HDS documentation pages.
 *
 * Checks:
 *   1. Foundation pages — must have DocPageHeader (or legacy pattern) + ≥1 section
 *   2. Component pages — must render at least one live specimen
 *   3. DocSection title uniqueness — no two DocSections in the same file may share a title
 *      (duplicate titles generate duplicate anchor ids, breaking ToC navigation)
 *   4. Third-party linking — named product/library references in JSX text should resolve
 *      to a href in the same file (warn-only, suppressible with // link-ok: <reason>)
 *
 * Suppression:
 *   - Add `// doc-structure-ok: <reason>` to a file to skip all checks for that file.
 *   - Add `// link-ok: <reason>` on the same line to suppress a single third-party link warning.
 *
 * Usage:
 *   node scripts/check-doc-structure.mjs
 *   node scripts/check-doc-structure.mjs --warn-links-only
 */

import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');

const DOC_PAGES = [
  'src/app/pages/hds/ColorPage.tsx',
  'src/app/pages/hds/TypographyPage.tsx',
  'src/app/pages/hds/SpacingPage.tsx',
  'src/app/pages/hds/ShapePage.tsx',
  'src/app/pages/hds/ElevationPage.tsx',
  'src/app/pages/hds/MotionPage.tsx',
  'src/app/pages/hds/BreakpointsPage.tsx',
  'src/app/pages/hds/GuidancePage.tsx',
  'src/app/pages/hds/TechStackPage.tsx',
  'src/app/pages/hds/LicensePage.tsx',
  'src/app/pages/hds/GettingStartedPage.tsx',
  'src/app/pages/hds/IconsPage.tsx',
  'src/app/pages/hds/ScopePage.tsx',
].map(p => join(ROOT, p));

// Component pages: all category pages inside hds/components/
// Shell files (ComponentDocPageShell, IconGallery) are excluded — they are
// shared layout, not docs pages.
const COMPONENT_PAGE_EXCLUDES = new Set([
  'ComponentDocPageShell.tsx',
  'IconGallery.tsx',
]);

const COMPONENT_DOC_PAGES = readdirSync(join(ROOT, 'src/app/pages/hds/components'))
  .filter(f => f.endsWith('.tsx') && !COMPONENT_PAGE_EXCLUDES.has(f))
  .map(f => join(ROOT, 'src/app/pages/hds/components', f));

function read(file) {
  return readFileSync(file, 'utf8');
}

function shortPath(file) {
  return relative(ROOT, file).replace(/\\/g, '/');
}

/**
 * Specimen gate: assert that a component doc page renders at least one live
 * specimen. Accepted evidence (any one is sufficient):
 *   - HdsComponentDoc  — full primitive doc block (auto-renders SpecimenBlock)
 *   - CategoryComponentDocs — category orchestration (auto-renders HdsComponentDoc per component)
 *   - SpecimenBlock — direct specimen composition
 *   - AutoPreviewSpecimen — inline auto-preview
 */
function hasSpecimen(source) {
  return (
    source.includes('HdsComponentDoc') ||
    source.includes('CategoryComponentDocs') ||
    source.includes('SpecimenBlock') ||
    source.includes('AutoPreviewSpecimen')
  );
}

/**
 * Soft rule: MISSING_DOCSECTION_ID
 * DocSection/HdsFoundationSection must have id or title prop.
 * Multi-line: accumulate attribute block until closing > or />.
 */
function findMissingDocSectionIds(source) {
  const lines = source.split('\n');
  const issues = [];
  const OPEN_RE = /^\s*<(DocSection|HdsFoundationSection)\b/;
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN_RE.test(lines[i])) continue;
    let block = '';
    let j = i;
    while (j < lines.length) {
      block += ' ' + lines[j];
      if (/\/?>/.test(lines[j])) break;
      j++;
    }
    if (!/\bid=/.test(block) && !/\btitle=/.test(block)) {
      issues.push(i + 1);
    }
  }
  return issues;
}

/**
 * DocSection title uniqueness: extract all title= values from <DocSection
 * (handles both single-line and multi-line JSX, inline and expression values).
 * Returns an array of duplicate title strings found.
 */
function findDuplicateDocSectionTitles(source) {
  const titleRe = /<DocSection\b[^>]*\btitle=\s*["']([^"']+)["']/g;
  const titles = [];
  for (const m of source.matchAll(titleRe)) {
    titles.push(m[1]);
  }
  const seen = new Set();
  const dupes = new Set();
  for (const t of titles) {
    if (seen.has(t)) dupes.add(t);
    seen.add(t);
  }
  return [...dupes];
}

/**
 * Third-party linking check.
 * Known library/product names that should be linked when referenced in JSX text.
 * Excluded from imports, JSDoc, and comment-only lines.
 *
 * Each entry: { name, urlPattern } where urlPattern is a regex or string to search for
 * a matching href near the name (within the same source file).
 */
// THIRD_PARTY_PRODUCTS -- seed list. Add entries as doc corpus grows.
const THIRD_PARTY_PRODUCTS = [
  { name: 'Phosphor Icons', href: 'phosphoricons.com' },
  { name: 'Radix UI', href: 'radix-ui.com' },
  { name: 'Figma', href: 'figma.com' },
  { name: 'shadcn/ui', href: 'ui.shadcn.com' },
  { name: 'Tailwind', href: 'tailwindcss.com' },
  { name: 'Playwright', href: 'playwright.dev' },
  { name: 'TypeScript', href: 'typescriptlang.org' },
  { name: 'Storybook', href: 'storybook.js.org' },
  { name: 'Mermaid', href: 'mermaid.js.org' },
  { name: 'Lucide', href: 'lucide.dev' },
  { name: 'Vercel', href: 'vercel.com' },
  { name: 'Motion', href: 'motion.dev' },
  { name: 'WCAG', href: 'w3.org' },
  { name: 'Vite', href: 'vite.dev' },
  { name: 'React', href: 'react.dev' },
];

/**
 * Check if a file that references a named product also includes a hyperlink
 * pointing to that product's domain.
 *
 * Returns warnings (not errors) for each unlinked reference found.
 * Suppressible with // link-ok: on the containing line.
 */
function checkThirdPartyLinks(source, short) {
  const warnings = [];
  const lines = source.split('\n');

  for (const product of THIRD_PARTY_PRODUCTS) {
    // Only flag if the name appears in JSX/template context (not just imports/comments)
    // Strategy: look for name in lines that don't start with import/comment
    const nameRe = new RegExp(`\\b${product.name.replace('/', '\\/')}\\b`);
    const linksHref = source.includes(product.href);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!nameRe.test(line)) continue;
      // Skip import lines and comment-only lines
      if (/^\s*(import |\/\/|\/\*|\*|#)/.test(line)) continue;
      // Skip suppressed lines (// link-ok: and // hds-bypass: third-party-link both accepted)
      if (/link-ok:/i.test(line)) continue;
      if (/hds-bypass:\s*third-party-link/i.test(line)) continue;
      const prevCtx = lines.slice(Math.max(0, i - 2), i).join(' ');
      if (/hds-bypass:\s*third-party-link/i.test(prevCtx)) continue;
      // Skip type annotation contexts
      if (/:\s*React\.ReactNode|interface\s+|type\s+/.test(line)) continue;
      // Skip data/object literal lines (string values in arrays or object properties)
      // These are NOT rendered JSX text; they're data that may or may not render with links
      if (/^\s*['"`].*['"`]\s*[,;]?\s*$/.test(line.trim())) continue;
      if (/^\s*(const|let|var|\/\/)\s/.test(line)) continue;
      // Only flag lines that look like JSX text content (contain < or > or are inside JSX)
      if (!line.includes('<') && !line.includes('>') && !line.includes('{')) continue;

      // If no matching href exists anywhere in the file, warn
      if (!linksHref) {
        warnings.push(`${short}:${i + 1} — "${product.name}" referenced in JSX text but no link to ${product.href} found in file. Add href or // link-ok: <reason>`);
      }
    }
  }
  return warnings;
}

const failures = [];
const warnings = [];
const softWarnings = []; // warn-only; promoted to failures with --strict

// ── Foundation page checks ──────────────────────────────────────────────────

for (const file of DOC_PAGES) {
  const source = read(file);
  const short = shortPath(file);

  if (/doc-structure-ok:/.test(source)) continue;

  // Header check
  const hasNewHeader = source.includes('DocPageHeader');
  const hasLegacyHeader = source.includes('DocPageHeader') || source.includes('HdsFoundationSection');

  if (!hasNewHeader && !hasLegacyHeader) {
    failures.push(`${short}: missing DocPageHeader or legacy header pattern`);
  }

  // Section check
  const newSectionMatches = [...source.matchAll(/<DocSection\b([^>]*)/g)];
  const legacySectionMatches = [...source.matchAll(/<HdsFoundationSection\b([^>]*)/g)];

  if (newSectionMatches.length === 0 && legacySectionMatches.length === 0) {
    failures.push(`${short}: must contain at least one DocSection or HdsFoundationSection`);
  }

  // DocSection title uniqueness
  const dupes = findDuplicateDocSectionTitles(source);
  for (const dup of dupes) {
    failures.push(`${short}: duplicate DocSection title "${dup}" — generates conflicting anchor ids`);
  }

  // Third-party links (warn only)
  warnings.push(...checkThirdPartyLinks(source, short));

  // Soft rule: MISSING_DOCSECTION_ID
  for (const line of findMissingDocSectionIds(source)) {
    softWarnings.push(
      `MISSING_DOCSECTION_ID  ${short}:${line} -- DocSection/HdsFoundationSection has neither id nor title prop (no navigable anchor)`,
    );
  }
}

// ── Specimen gate ─────────────────────────────────────────────────────────────
// Every component category page must render at least one live specimen.

for (const file of COMPONENT_DOC_PAGES) {
  const source = read(file);
  const short = shortPath(file);

  if (/doc-structure-ok:/.test(source)) continue;

  if (!hasSpecimen(source)) {
    failures.push(
      `${short}: missing specimen — add HdsComponentDoc, CategoryComponentDocs, or SpecimenBlock`,
    );
  }

  // DocSection title uniqueness (component pages too)
  const dupes = findDuplicateDocSectionTitles(source);
  for (const dup of dupes) {
    failures.push(`${short}: duplicate DocSection title "${dup}" — generates conflicting anchor ids`);
  }

  // Soft rule: MISSING_DOCSECTION_ID
  for (const line of findMissingDocSectionIds(source)) {
    softWarnings.push(
      `MISSING_DOCSECTION_ID  ${short}:${line} -- DocSection/HdsFoundationSection has neither id nor title prop (no navigable anchor)`,
    );
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

if (STRICT) {
  failures.push(...softWarnings);
}

if (warnings.length > 0) {
  console.warn('\nDoc structure warnings (third-party linking):');
  for (const w of warnings) {
    console.warn(`  ⚠  ${w}`);
  }
}

if (softWarnings.length > 0 && !STRICT) {
  console.warn('\nDoc structure soft warnings (pass --strict to hard-fail):');
  for (const w of softWarnings) {
    console.warn(`  \u26a0  ${w}`);
  }
}

if (failures.length > 0) {
  console.error('\nDoc structure check failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('');
  process.exit(1);
}

const totalWarnings = warnings.length + softWarnings.length;
const warnSuffix = totalWarnings > 0 ? ` (${totalWarnings} warning(s))` : '';
console.log(`\nDoc structure check passed — ${DOC_PAGES.length} foundation pages + ${COMPONENT_DOC_PAGES.length} component pages (specimen gate) validated.${warnSuffix}\n`);
