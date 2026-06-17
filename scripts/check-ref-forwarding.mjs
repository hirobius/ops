/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-ref-forwarding.mjs
 *
 * Verifies that HDS components rendering native form controls forward their
 * ref to the underlying DOM element.
 *
 * Why this matters:
 *   Form libraries (React Hook Form, Formik, react-aria) and focus management
 *   code (focus traps, programmatic focus) need imperative access to the
 *   underlying DOM node. Without forwardRef, these integrations break silently —
 *   the component appears to work but ref is always null.
 *
 *   A DS component that wraps a native form element is not composable unless
 *   it exposes the underlying node. This is the difference between a DS
 *   "component" and a DS "primitive."
 *
 * Checks:
 *   Components in src/app/components/ that render <input>, <select>, or
 *   <textarea> as interactive controls must use forwardRef.
 *
 *   Excluded from check:
 *   - Components in SKIP_FILES (hooks, types, utilities)
 *   - Files using // ref-ok: <reason> exemption comment at the top
 *
 * Inspired by:
 *   Shopify Polaris composability principle — "Every primitive component
 *   should expose its DOM node so callers can measure, focus, and animate it."
 *   Material UI — every form component (TextField, Select, Checkbox) forwards
 *   inputRef to the underlying native element.
 *
 * Usage: pnpm check:refs
 * Exempt: add // ref-ok: <reason> anywhere in the file
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT           = process.cwd();
const COMPONENTS_DIR = join(ROOT, 'src/app/components');

const SKIP_FILES = new Set([
  'types.ts', 'hooks.ts', 'HdsWebGLTriangleLogo.tsx',
  'DocSections.tsx', 'HdsDocPanels.tsx',
]);

// Tags that indicate a component is a form control primitive
const FORM_CONTROL_RE = /<(input|select|textarea)\b/;

// ── Scanner ───────────────────────────────────────────────────────────────────

const violations = [];

for (const entry of readdirSync(COMPONENTS_DIR)) {
  if (SKIP_FILES.has(entry)) continue;
  if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;

  const full    = join(COMPONENTS_DIR, entry);
  const stat    = statSync(full);
  if (!stat.isFile()) continue;

  const content = readFileSync(full, 'utf-8');

  // Skip if file has a ref-ok exemption
  if (content.includes('// ref-ok')) continue;

  // Only check files that render form control elements
  if (!FORM_CONTROL_RE.test(content)) continue;

  // Check if the file uses forwardRef
  if (!content.includes('forwardRef')) {
    const rel = relative(ROOT, full).replace(/\\/g, '/');

    // Find which control elements are present for the report
    const controls = [];
    if (/<input\b/.test(content))    controls.push('<input>');
    if (/<select\b/.test(content))   controls.push('<select>');
    if (/<textarea\b/.test(content)) controls.push('<textarea>');

    violations.push({
      file:     rel,
      controls: controls.join(', '),
    });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log('\nâœ“ Ref forwarding check passed — all form control components forward their ref.\n');
  process.exit(0);
} else {
  console.error(`\nâœ— Ref forwarding check failed — ${violations.length} component(s) missing forwardRef.\n`);
  console.error('  Form libraries and focus management need ref access to the underlying DOM node.\n');
  console.error('  Fix:    Wrap the export with forwardRef<HTMLInputElement, Props>(() => ...)');
  console.error('  Exempt: Add // ref-ok: <reason> if the component is intentionally non-composable\n');

  for (const { file, controls } of violations) {
    console.error(`  ${file}`);
    console.error(`    renders: ${controls} — needs forwardRef`);
    console.error('');
  }

  process.exit(1);
}
