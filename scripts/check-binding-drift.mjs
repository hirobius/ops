#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-binding-drift.mjs
 *
 * Soft gate that catches the failure mode where a component starts
 * referencing a component-tier CSS variable that the masters pipeline
 * doesn't know to bind. For each Hds*.tsx whose spec has a populated
 * slots[], every var(--component-<slug>-*) reference must resolve to a
 * path bound by that spec's slots[*].tokenBinding (rest state) or
 * spec.tokens.* (state overlays consumed by the pipeline's slotBinding
 * helper, per Option B state semantics).
 *
 * Out of scope (this gate, not 8v-5):
 *   - var(--semantic-*) and var(--primitive-*) references — ambient theme
 *     tokens are globally available and not subject to per-spec binding.
 *   - var(--component-<other-slug>-*) cross-component references — covered
 *     by the binding-completeness validator promotion in 8v-5.
 *
 * Modes:
 *   default — exit 1 on any drift
 *   --soft  — print warnings and exit 0 (initial wiring; promote in 8v-5)
 *
 * Per-file exemption: a `binding-ok: <reason>` marker inside any block
 * comment in the file's first 15 lines skips the file. Consistent with
 * hds-bypass / font-ok / hds-ok conventions used elsewhere.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOFT = process.argv.includes('--soft');
const VERBOSE = process.argv.includes('--verbose');

const COMPONENTS_DIR = path.join(ROOT, 'src/app/components');
const MANIFEST_PATH = path.join(ROOT, 'public/hds-manifest.json');

function pathToCSSVar(p) {
  return '--' + p.split('.').join('-');
}

function specToSlug(name) {
  const stripped = name.replace(/^Hds/, '');
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

function bindablePaths(spec) {
  const out = new Set();
  for (const slot of spec.slots || []) {
    const tb = slot.tokenBinding || {};
    for (const v of Object.values(tb)) {
      if (typeof v === 'string') out.add(v);
    }
  }
  for (const v of Object.values(spec.tokens || {})) {
    if (typeof v === 'string' && v.includes('.')) out.add(v);
  }
  return out;
}

function fileHeaderHasBindingOk(source) {
  const head = source.split('\n').slice(0, 15).join('\n');
  return /binding-ok\b/.test(head);
}

function lineNumber(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function extractCssVars(source) {
  const out = [];
  const re = /var\(\s*(--[a-zA-Z][a-zA-Z0-9-]*)\s*[),]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({ name: m[1], index: m.index });
  }
  return out;
}

function checkComponent(name, spec, sourcePath) {
  const violations = [];
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (fileHeaderHasBindingOk(source)) return violations;

  const slug = specToSlug(name);
  const componentTierPrefix = `--component-${slug}-`;
  const bindableVars = new Set(
    [...bindablePaths(spec)].map(pathToCSSVar),
  );

  for (const ref of extractCssVars(source)) {
    if (!ref.name.startsWith(componentTierPrefix)) continue;
    if (bindableVars.has(ref.name)) continue;
    violations.push({
      file: path.relative(ROOT, sourcePath),
      line: lineNumber(source, ref.index),
      cssVar: ref.name,
      spec: name,
      message:
        `${ref.name} used in ${name}.tsx but not in ${name}.slots[*].tokenBinding ` +
        `or ${name}.tokens.* — masters pipeline cannot bind it`,
    });
  }
  return violations;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const specs = manifest.componentSpecs || {};
  const inScope = Object.entries(specs).filter(
    ([, s]) => Array.isArray(s.slots) && s.slots.length > 0,
  );

  const violations = [];
  let scanned = 0;
  let missingSource = 0;

  for (const [name, spec] of inScope) {
    const sourcePath = path.join(COMPONENTS_DIR, `${name}.tsx`);
    if (!fs.existsSync(sourcePath)) {
      missingSource += 1;
      continue;
    }
    scanned += 1;
    violations.push(...checkComponent(name, spec, sourcePath));
  }

  if (VERBOSE || violations.length > 0) {
    const tail = missingSource > 0
      ? ` ${missingSource} spec(s) had slots[] but no matching .tsx — ignored.`
      : '';
    console.log(
      `Scanned ${scanned} component file(s) with populated slots[].${tail}`,
    );
  }

  if (violations.length === 0) {
    console.log('OK — no binding drift detected');
    process.exit(0);
  }

  const grouped = {};
  for (const v of violations) {
    grouped[v.spec] = (grouped[v.spec] || 0) + 1;
  }

  const stream = SOFT ? console.warn : console.error;
  const label = SOFT ? '⚠ ' : '✗ ';
  for (const v of violations) {
    stream(`${label}${v.file}:${v.line}  [BINDING_DRIFT]  ${v.message}`);
  }
  stream(
    `\n${violations.length} binding drift violation(s) — counts: ` +
      `${Object.entries(grouped).map(([k, n]) => `${k}=${n}`).join(', ')}`,
  );

  if (SOFT) {
    console.warn(
      '\n(--soft mode: exiting 0. Drop --soft once existing drift is fixed — see 8v-5.)',
    );
    process.exit(0);
  }
  process.exit(1);
}

main();
