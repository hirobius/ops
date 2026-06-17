#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-motion.mjs
 *
 * Verifies that interactive components ship with motion feedback — the HDS
 * standard that every user action has a visible, token-timed response.
 *
 * ACCEPTANCE CRITERIA
 * ───────────────────
 * Any .tsx file in src/app/components/ that contains interactive elements
 * (<button, <input, <select, <a, or onClick handlers) must satisfy at least
 * ONE of the following:
 *
 *   A) Imports from "motion/react" and uses motion.* or AnimatePresence
 *   B) Uses a CSS transition referencing an hds.duration.* token
 *   C) Is annotated with // motion-ok: <reason> to document intentional exemption
 *
 * WHAT THIS CATCHES
 * ─────────────────
 *   - Buttons with no hover/press feedback
 *   - Dropdowns that appear instantly with no entrance animation
 *   - Interactive controls missing transition on state changes
 *
 * WHAT IT DOES NOT CATCH
 * ──────────────────────
 *   - Static/display components (no interaction = no motion required)
 *   - Canvas-based animations (handled by requestAnimationFrame, not motion/react)
 *   - CSS-only components using transition: without hds.duration (use motion-ok)
 *
 * DESIGN INSPIRATION
 * ──────────────────
 *   Apple HIG    — every tap and state change has a physical, timed response
 *   Material You — motion is a communication tool, not decoration
 *   Framer       — 60fps feedback is the baseline expectation in modern UI
 *
 * "Motion communicates that the system is alive and responding. A UI with
 *  no motion is a UI that feels broken." — HDS Motion Principle #1
 *
 * SELF-IMPROVEMENT LOG
 * ────────────────────
 * v1 (2026-03-16): Initial check — interactive components need motion/react import
 *                  OR hds.duration transition reference OR // motion-ok exemption.
 *
 * Usage: pnpm check:micromotion
 * Exempt: // motion-ok: <reason> on any line in the file
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__scriptDir, '..');
const COMP_DIR   = join(ROOT, 'src/app/components');
const failures   = [];

const isFixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// ── Files where motion is structurally N/A ────────────────────────────────────
// These are utility files, type definitions, or display-only components.
// When adding here, document WHY motion is not applicable.
const SKIP = new Set([
  'types.ts',           // type definitions — no JSX
  'HdsWebGLTriangleLogo.tsx', // canvas animation — RAF loop, not motion/react
  'ImageFill.tsx',      // pure image wrapper — display only
  'AssetImg.tsx',    // pure image wrapper — display only
  'BulgeCard.tsx',      // SVG canvas animation — RAF loop, motion-ok pattern
]);

// ── What makes a file "interactive" ──────────────────────────────────────────
const INTERACTIVE_PATTERNS = [
  /\bonClick\b/,
  /\bonMouseEnter\b/,
  /\bonMouseLeave\b/,
  /\bonChange\b/,
  /<button/,
  /<input/,
  /<select/,
  /<a\s/,
  /role="button"/,
  /role="link"/,
];

// ── What satisfies the motion requirement ─────────────────────────────────────
const MOTION_PATTERNS = [
  /from ['"]motion\/react['"]/,         // imports motion/react
  /motion\.[a-z]/,                      // uses motion.div / motion.button / etc.
  /AnimatePresence/,                    // uses AnimatePresence
  /whileHover|whileTap|whileFocus/,     // uses motion gesture props
  /hds\.duration\./,                    // CSS transition references duration token
  /hds\.easing\./,                      // references easing token in transition
];

// ── Per-file exemption ────────────────────────────────────────────────────────
const EXEMPT_PATTERN = new RegExp(String.raw`\/\/\s*motion-ok:`);

// ── Scan ──────────────────────────────────────────────────────────────────────

function scanDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) { scanDir(full); continue; }
    if (extname(entry) !== '.tsx' && extname(entry) !== '.ts') continue;
    if (SKIP.has(entry)) continue;

    const content = readFileSync(full, 'utf-8');

    // Skip if explicitly exempted
    if (EXEMPT_PATTERN.test(content)) continue;

    // Is this file interactive?
    const isInteractive = INTERACTIVE_PATTERNS.some(p => p.test(content));
    if (!isInteractive) continue;

    // Does it satisfy the motion requirement?
    const hasMotion = MOTION_PATTERNS.some(p => p.test(content));
    if (!hasMotion) {
      const rel = full.replace(ROOT + '/', '');
      failures.push({
        file: rel,
        msg:
          'Interactive component has no motion feedback.\n'
        + '       Fix one of:\n'
        + '         A) Import from "motion/react" and wrap elements with motion.* or AnimatePresence\n'
        + '         B) Add CSS transition referencing hds.duration.* on state-changing elements\n'
        + '         C) Add // motion-ok: <reason> to document why motion is intentionally absent\n'
        + '\n'
        + '       Example: transition: `background-color ${hds.duration.fast}s ease`\n'
        + '       Example: import { motion } from "motion/react"; → <motion.div whileHover={{ ... }}>',
      });
    }
  }
}

if (isFixtureMode && fixtureFile) {
  // Scan only the single fixture file
  const absPath = resolve(fixtureFile);
  const entry = absPath.split('/').pop() ?? '';
  if (!SKIP.has(entry) && (absPath.endsWith('.tsx') || absPath.endsWith('.ts'))) {
    const content = readFileSync(absPath, 'utf-8');
    if (!EXEMPT_PATTERN.test(content)) {
      const isInteractive = INTERACTIVE_PATTERNS.some(p => p.test(content));
      if (isInteractive) {
        const hasMotion = MOTION_PATTERNS.some(p => p.test(content));
        if (!hasMotion) {
          const rel = absPath.replace(ROOT + '/', '');
          failures.push({
            file: rel,
            msg: 'Interactive component has no motion feedback.\n'
              + '       Fix one of:\n'
              + '         A) Import from "motion/react" and wrap elements with motion.* or AnimatePresence\n'
              + '         B) Add CSS transition referencing hds.duration.* on state-changing elements\n'
              + '         C) Add // motion-ok: <reason> to document why motion is intentionally absent',
          });
        }
      }
    }
  }
} else {
  scanDir(COMP_DIR);
}

// ── Report ────────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log('\nâœ“ Motion check passed — all interactive components have motion feedback.\n');
  process.exit(0);
} else {
  console.error(`\nâœ— Motion check failed — ${failures.length} component(s) have no motion feedback.\n`);
  console.error('  Every interactive component needs at least one of:\n');
  console.error('    A) motion/react (motion.div, AnimatePresence, whileHover, etc.)');
  console.error('    B) CSS transition referencing hds.duration.* tokens');
  console.error('    C) // motion-ok: <reason> annotation documenting intentional absence\n');
  console.error('  Motion is communication. A UI with no feedback feels broken.\n');

  for (const { file, msg } of failures) {
    console.error(`  ${file}`);
    console.error(`    âœ—  ${msg}\n`);
  }

  process.exit(1);
}
