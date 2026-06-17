/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-reduced-motion.mjs
 *
 * Verifies that the HDS motion system respects prefers-reduced-motion at both layers:
 *
 *   Layer 1 — CSS transitions:
 *     src/styles/theme.css must contain an @media (prefers-reduced-motion: reduce)
 *     block that zeroes all --hds-duration-* custom properties.
 *
 *   Layer 2 — Motion (Framer Motion) animations:
 *     The app root (src/app/pages/Root.tsx) must wrap the tree with
 *     <MotionConfig reducedMotion="user"> so all motion/react animations
 *     automatically collapse to instant for affected users.
 *
 * Inspired by:
 *   IBM Carbon — motion.duration tokens mapped to 0ms in reduced-motion context.
 *   Apple HIG  — prefers-reduced-motion is a legal a11y requirement in many
 *                jurisdictions (WCAG 2.3.3 AAA; de facto standard for AA compliance).
 *   Adobe Spectrum — MotionContext with reducedMotion flag covers the JS layer.
 *
 * "Never assume a user wants animation. 10–35% of users report motion sensitivity."
 * — Vestibular Disorders Association (VeDA)
 *
 * Usage: pnpm check:motion
 * Exempt: not applicable — this check has no per-line exemptions.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT     = process.cwd();
const failures = [];

// ── Duration tokens that MUST be zeroed in the reduced-motion block ───────────

const REQUIRED_DURATION_VARS = [
  '--primitive-duration-instant',
  '--primitive-duration-short',
  '--primitive-duration-medium',
  '--primitive-duration-long',
  '--hds-motion-productive-duration',
  '--hds-motion-expressive-duration',
  '--hds-motion-spatial-duration',
  '--hds-motion-exit-duration',
];

// ── Layer 1: CSS @media (prefers-reduced-motion) ──────────────────────────────

const THEME_CSS = join(ROOT, 'src/styles/theme.css');

try {
  const css = readFileSync(THEME_CSS, 'utf-8');

  if (!css.includes('@media (prefers-reduced-motion')) {
    failures.push({
      file: 'src/styles/theme.css',
      msg:  'Missing @media (prefers-reduced-motion: reduce) block.\n'
          + '       Add a block that zeroes the primitive and semantic motion duration vars:\n\n'
          + '       @media (prefers-reduced-motion: reduce) {\n'
          + '         :root { --primitive-duration-instant: 0s; ... }\n'
          + '       }',
    });
  } else {
    // Extract all content inside @media (prefers-reduced-motion) blocks.
    // Uses brace-depth counting to handle nested selectors (e.g. :root {}).
    let blockContent = '';
    const mediaRe = /@media\s*\(prefers-reduced-motion[^)]*\)\s*\{/g;
    let m;
    while ((m = mediaRe.exec(css)) !== null) {
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        if (depth > 0) blockContent += css[i];
        i++;
      }
    }

    for (const varName of REQUIRED_DURATION_VARS) {
      if (!blockContent.includes(varName)) {
        failures.push({
          file: 'src/styles/theme.css',
          msg:  `prefers-reduced-motion block is missing override for ${varName}.\n`
              + `       Add: ${varName}: 0s; inside the @media block.`,
        });
      }
    }
  }
} catch {
  failures.push({ file: 'src/styles/theme.css', msg: 'File not found.' });
}

// ── Layer 2: MotionConfig reducedMotion="user" in App.tsx ────────────────────

const ROOT_TSX = join(ROOT, 'src/app/App.tsx');

try {
  const root = readFileSync(ROOT_TSX, 'utf-8');

  if (!root.includes('MotionConfig')) {
    failures.push({
      file: 'src/app/App.tsx',
      msg:  'Missing <MotionConfig reducedMotion="user">.\n'
          + '       Import MotionConfig from "motion/react" and wrap the root tree:\n\n'
          + '       <MotionConfig reducedMotion="user">\n'
          + '         <ErrorBoundary>...</ErrorBoundary>\n'
          + '       </MotionConfig>\n\n'
          + '       This makes ALL motion/react animations respect prefers-reduced-motion\n'
          + '       automatically — no per-component code changes needed.',
    });
  } else if (!root.includes('reducedMotion')) {
    failures.push({
      file: 'src/app/App.tsx',
      msg:  'MotionConfig found but reducedMotion prop is missing.\n'
          + '       Add reducedMotion="user" to the MotionConfig element.',
    });
  }
} catch {
  failures.push({ file: 'src/app/App.tsx', msg: 'File not found.' });
}

// ── Report ────────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log('\n✓ Reduced motion check passed — CSS + Motion layers both covered.\n');
  process.exit(0);
} else {
  console.error(`\n✗ Reduced motion check failed — ${failures.length} issue(s).\n`);
  console.error('  Motion sensitivity affects 10–35% of users. Both layers must be covered:\n');
  console.error('    Layer 1: @media (prefers-reduced-motion) in theme.css — fixes CSS transitions');
  console.error('    Layer 2: <MotionConfig reducedMotion="user"> in App.tsx — fixes JS animations\n');

  for (const { file, msg } of failures) {
    console.error(`  ${file}`);
    console.error(`    ✗  ${msg}\n`);
  }

  process.exit(1);
}
