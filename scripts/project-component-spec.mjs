#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * project-component-spec.mjs (8s-8)
 *
 * Walks a flagship HDS component .tsx file with the TypeScript AST and
 * projects a componentSpec shape from source. Used as a drift detector
 * against the hand-authored manifest entries written by build-tokens.mjs.
 *
 * Projection axes (minimum viable for 8s-4..8s-7 flagships):
 *   props            ← members of `export interface HdsXProps` ∪ cva variant
 *                       axes (multi-value → enum, boolean → boolean), minus
 *                       a fixed ignore list (className, children, style,
 *                       asChild, isDark, ref, key)
 *   variantAxes      ← multi-value axes from cva() variants block
 *   compoundMembers  ← `Component.Member = ...` assignments (Trigger / Body /
 *                       Footer / etc.) — distinct from manifest "slots" which
 *                       represent Figma regions with token bindings
 *   allowedChildren  ← derived: ['*'] when the root accepts children, [] for
 *                       leaf controls (extends Input/ButtonHTMLAttributes)
 *
 * Round-trip diff classifies each delta against a per-component allowance
 * map (TOLERATED_DRIFT). Tolerated entries are intentional curator additions
 * in the manifest seed (e.g. `state` axis, synthetic part-level props).
 *
 * Usage:
 *   node scripts/project-component-spec.mjs <path.tsx>
 *   node scripts/project-component-spec.mjs --verify-roundtrip <path.tsx>
 *   node scripts/project-component-spec.mjs --verify-all
 */

import { readFileSync, writeFileSync as fsWriteFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');

const FLAGSHIPS = [
  'src/app/components/button.tsx',
  'src/app/components/Input.tsx',
  'src/app/components/Card.tsx',
  'src/app/components/Dialog.tsx',
];

// Props ignored at projection time. These are React/host-element plumbing,
// Radix forwarder patterns, or props the curator has explicitly deprecated.
// `className` and `children` are NOT ignored: when an interface declares them
// explicitly the manifest reflects them too, so the projection should surface
// them to keep the round-trip honest.
const IGNORED_PROPS = new Set([
  'style',
  'key',
  'ref',
  'asChild',
  'isDark',
]);

// Per-component tolerated drift. Each entry permits a known divergence
// between projection and manifest seed; the script does not flag these.
//
//   manifestPropsExtra  — props the manifest curates that source does not
//                          declare on the root interface (synthesized from
//                          parts, intrinsic to the host element, etc.)
//   sourcePropsExtra    — props in the interface that the manifest skips on
//                          purpose (forwarding helpers, layout escapes)
//   manifestAxesExtra   — axes the manifest declares without a cva backing
//                          (state / padding lifted to axis status)
//   sourceAxesExtra     — cva axes the manifest deliberately does not promote
//                          (textStyle handled as a presentational hint, not
//                          a Figma variant)
//   compoundExtra       — compound members the manifest does not surface
//                          (Trigger / Portal / Overlay are root concerns)
const TOLERATED_DRIFT = {
  Button: {
    manifestPropsExtra: [],
    sourcePropsExtra: [],
    manifestAxesExtra: ['state'],
    sourceAxesExtra: [],
    compoundExtra: [],
  },
  Input: {
    manifestPropsExtra: ['placeholder'],
    sourcePropsExtra: ['className', 'inputClassName', 'leadingVisual', 'trailingVisual', 'invalid'],
    manifestAxesExtra: ['state'],
    sourceAxesExtra: ['textStyle'],
    compoundExtra: [],
  },
  Card: {
    manifestPropsExtra: ['className', 'children'],
    sourcePropsExtra: [],
    manifestAxesExtra: ['padding'],
    sourceAxesExtra: [],
    compoundExtra: ['Header', 'Title', 'Description', 'Body', 'Footer'],
  },
  Dialog: {
    manifestPropsExtra: ['title', 'description', 'hideClose'],
    sourcePropsExtra: [],
    manifestAxesExtra: ['state'],
    sourceAxesExtra: [],
    compoundExtra: ['Trigger', 'Portal', 'Overlay', 'Content', 'Close', 'Header', 'Footer', 'Title', 'Description'],
  },
};

// ── Source loading ────────────────────────────────────────────────────────────

function readSource(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function parseSource(relativePath, source) {
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function componentNameFromPath(relativePath) {
  const stem = basename(relativePath, '.tsx');
  return stem.length > 0 ? stem[0].toUpperCase() + stem.slice(1) : stem;
}

// ── Props extraction ──────────────────────────────────────────────────────────

// Candidate names for the props interface. Components in this repo use mixed
// conventions: flagships (Button/Card/Input/Dialog) declare `XProps`,
// while shadcn-pivoted primitives often drop the prefix (`BadgeProps`,
// `AlertProps`). Try the canonical form first, then the unprefixed form.
function propsInterfaceCandidates(componentName) {
  const candidates = [`${componentName}Props`];
  if (componentName.startsWith('Hds')) {
    candidates.push(`${componentName.slice(3)}Props`);
  }
  return candidates;
}

function findPropsInterface(sourceFile, componentName) {
  const candidates = propsInterfaceCandidates(componentName);
  for (const interfaceName of candidates) {
    for (const statement of sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      if (statement.name.text === interfaceName) return statement;
    }
  }
  return null;
}

function projectInterfaceProps(sourceFile, componentName) {
  const props = {};
  const decl = findPropsInterface(sourceFile, componentName);
  if (!decl) return props;

  for (const member of decl.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;

    const propName = member.name.text;
    if (IGNORED_PROPS.has(propName)) continue;

    const optional = Boolean(member.questionToken);
    const typeText = member.type ? member.type.getText(sourceFile).trim() : 'unknown';
    const normalized = normalizeType(typeText);

    if (optional) normalized.optional = true;
    props[propName] = normalized;
  }

  return props;
}

function normalizeType(typeText) {
  const enumValues = parseEnumValues(typeText);
  if (enumValues) return { type: 'enum', values: enumValues };

  if (typeText === 'boolean') return { type: 'boolean' };
  if (typeText === 'string') return { type: 'string' };
  if (typeText === 'number') return { type: 'number' };
  if (/^React\.ReactNode$/.test(typeText) || /^ReactNode$/.test(typeText)) return { type: 'ReactNode' };

  return { type: typeText };
}

function parseEnumValues(typeText) {
  const parts = typeText.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const allQuoted = parts.every((p) => /^['"][^'"]+['"]$/.test(p));
  if (!allQuoted) return null;

  return parts.map((p) => p.replace(/^['"]|['"]$/g, ''));
}

// ── cva variant extraction ────────────────────────────────────────────────────
// Returns { axes: { name: { values: string[], boolean: bool } } } for every
// variants block in the file.

function extractCvaAxes(sourceFile) {
  const axes = {};

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'cva' &&
      node.arguments.length >= 2 &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const cfg = node.arguments[1];
      const variantsProp = cfg.properties.find(
        (prop) =>
          ts.isPropertyAssignment(prop) &&
          prop.name &&
          ((ts.isIdentifier(prop.name) && prop.name.text === 'variants') ||
            (ts.isStringLiteral(prop.name) && prop.name.text === 'variants')),
      );

      if (variantsProp && ts.isObjectLiteralExpression(variantsProp.initializer)) {
        for (const axisProp of variantsProp.initializer.properties) {
          if (!ts.isPropertyAssignment(axisProp) || !axisProp.name) continue;
          const axisName = ts.isIdentifier(axisProp.name)
            ? axisProp.name.text
            : ts.isStringLiteral(axisProp.name)
              ? axisProp.name.text
              : null;
          if (!axisName || !ts.isObjectLiteralExpression(axisProp.initializer)) continue;

          const values = [];
          let isBoolean = true;
          for (const valueProp of axisProp.initializer.properties) {
            if (!ts.isPropertyAssignment(valueProp) || !valueProp.name) continue;
            const valName = ts.isIdentifier(valueProp.name)
              ? valueProp.name.text
              : ts.isStringLiteral(valueProp.name)
                ? valueProp.name.text
                : null;
            if (valName) values.push(valName);
            if (valName !== 'true' && valName !== 'false') isBoolean = false;
          }
          axes[axisName] = { values, boolean: isBoolean && values.length > 0 };
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return axes;
}

function projectVariantAxes(cvaAxes) {
  return Object.entries(cvaAxes)
    .filter(([, info]) => !info.boolean)
    .map(([name]) => name);
}

function mergeAxesIntoProps(props, cvaAxes) {
  for (const [name, info] of Object.entries(cvaAxes)) {
    if (IGNORED_PROPS.has(name)) continue;
    if (props[name]) continue; // interface already declared the prop type
    if (info.boolean) {
      props[name] = { type: 'boolean', optional: true };
    } else {
      props[name] = { type: 'enum', values: info.values, optional: true };
    }
  }
  return props;
}

// ── Compound member extraction ────────────────────────────────────────────────

function projectCompoundMembers(sourceFile, componentName) {
  const members = new Set();

  function visit(node) {
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.expression.left) &&
      ts.isIdentifier(node.expression.left.expression) &&
      node.expression.left.expression.text === componentName &&
      ts.isIdentifier(node.expression.left.name)
    ) {
      members.add(node.expression.left.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...members];
}

// ── allowedChildren inference ─────────────────────────────────────────────────

function projectAllowedChildren(sourceFile, componentName) {
  const decl = findPropsInterface(sourceFile, componentName);
  let isLeafControl = false;

  if (decl && decl.heritageClauses) {
    for (const clause of decl.heritageClauses) {
      for (const type of clause.types) {
        const text = type.getText(sourceFile);
        if (/InputHTMLAttributes|ButtonHTMLAttributes/.test(text)) {
          isLeafControl = true;
        }
      }
    }
  }

  return isLeafControl ? [] : ['*'];
}

// ── Top-level projector ───────────────────────────────────────────────────────

export function projectSpec(relativePath) {
  const source = readSource(relativePath);
  const sourceFile = parseSource(relativePath, source);
  const componentName = componentNameFromPath(relativePath);

  const cvaAxes = extractCvaAxes(sourceFile);
  const props = mergeAxesIntoProps(projectInterfaceProps(sourceFile, componentName), cvaAxes);

  return {
    name: componentName,
    sourcePath: relativePath,
    props,
    variantAxes: projectVariantAxes(cvaAxes),
    compoundMembers: projectCompoundMembers(sourceFile, componentName),
    allowedChildren: projectAllowedChildren(sourceFile, componentName),
  };
}

// ── Round-trip diff ───────────────────────────────────────────────────────────

function setDiff(a, b) {
  return [...a].filter((x) => !b.has(x));
}

function diffAgainstManifest(projected) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const spec = manifest.componentSpecs?.[projected.name];

  if (!spec) {
    return [{ field: 'spec', projected: 'present', manifest: 'missing' }];
  }

  const tolerance = TOLERATED_DRIFT[projected.name] ?? {
    manifestPropsExtra: [],
    sourcePropsExtra: [],
    manifestAxesExtra: [],
    sourceAxesExtra: [],
    compoundExtra: [],
  };

  const diffs = [];

  // Props
  const projectedProps = new Set(Object.keys(projected.props));
  const manifestProps = new Set(Object.keys(spec.props ?? {}));
  const tolerateManifestExtra = new Set(tolerance.manifestPropsExtra);
  const tolerateSourceExtra = new Set(tolerance.sourcePropsExtra);
  const projectedExtra = setDiff(projectedProps, manifestProps).filter(
    (p) => !tolerateSourceExtra.has(p),
  );
  const manifestExtra = setDiff(manifestProps, projectedProps).filter(
    (p) => !tolerateManifestExtra.has(p),
  );
  if (projectedExtra.length || manifestExtra.length) {
    diffs.push({
      field: 'props',
      projectedExtra,
      manifestExtra,
    });
  }

  // variantAxes
  const projectedAxes = new Set(projected.variantAxes);
  const manifestAxes = new Set(spec.variantAxes ?? []);
  const tolerateManifestAxes = new Set(tolerance.manifestAxesExtra);
  const tolerateSourceAxes = new Set(tolerance.sourceAxesExtra);
  const axesProjectedExtra = setDiff(projectedAxes, manifestAxes).filter(
    (a) => !tolerateSourceAxes.has(a),
  );
  const axesManifestExtra = setDiff(manifestAxes, projectedAxes).filter(
    (a) => !tolerateManifestAxes.has(a),
  );
  if (axesProjectedExtra.length || axesManifestExtra.length) {
    diffs.push({
      field: 'variantAxes',
      projectedExtra: axesProjectedExtra,
      manifestExtra: axesManifestExtra,
    });
  }

  // compoundMembers — manifest does not store these directly, so the diff
  // operates against the tolerance allowlist. Anything outside that list is
  // unexpected source-level surface.
  const tolerateCompoundExtra = new Set(tolerance.compoundExtra);
  const compoundExtra = projected.compoundMembers.filter((m) => !tolerateCompoundExtra.has(m));
  if (compoundExtra.length > 0) {
    diffs.push({
      field: 'compoundMembers (unexpected)',
      projectedExtra: compoundExtra,
      manifestExtra: [],
    });
  }

  // allowedChildren — exact match
  const projectedAC = JSON.stringify([...projected.allowedChildren].sort());
  const manifestAC = JSON.stringify([...(spec.allowedChildren ?? [])].sort());
  if (projectedAC !== manifestAC) {
    diffs.push({
      field: 'allowedChildren',
      projectedExtra: projected.allowedChildren,
      manifestExtra: spec.allowedChildren,
    });
  }

  return diffs;
}

// ── Bulk additive merge ───────────────────────────────────────────────────────
// Walks every primitive/pattern componentSpec in the manifest, projects from
// its source file, and additively merges projected fields into the manifest
// IN PLACE. Hand-tuned fields (slots[], tokens.*, figmaPropertyMapping,
// propConstraints, states, etc.) are preserved verbatim — projection only
// fills gaps. Returns a per-spec report describing which fields were filled
// and which were preserved due to existing curator content.
function mergePropsAdditive(existing, projected) {
  const out = { ...(existing || {}) };
  let added = 0;
  let preserved = 0;
  for (const [name, projShape] of Object.entries(projected || {})) {
    if (out[name]) {
      preserved += 1;
      continue;
    }
    out[name] = projShape;
    added += 1;
  }
  return { props: out, added, preserved };
}

function mergeArrayAdditive(existing, projected) {
  // Used for variantAxes, compoundMembers, allowedChildren. If the manifest
  // already has a non-empty list, keep it (curator tuning). Otherwise adopt
  // projection. We never UNION arrays — projection ⊂ existing for axes when
  // existing exists, since curators may have promoted axes (state, padding)
  // that don't exist in cva.
  const existingArr = Array.isArray(existing) ? existing : null;
  if (existingArr && existingArr.length > 0) {
    return { value: existingArr, source: 'existing' };
  }
  return { value: Array.isArray(projected) ? projected : [], source: 'projected' };
}

function bulkMergeManifest({ apply = false, tiers = ['primitive'] } = {}) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const specs = manifest.componentSpecs || {};
  const report = [];

  for (const [name, spec] of Object.entries(specs)) {
    if (!tiers.includes(spec.tier)) continue;
    const sourcePath = spec.sourcePath || spec.filePath;
    if (!sourcePath || !sourcePath.endsWith('.tsx')) {
      report.push({ name, status: 'skipped', reason: 'no .tsx sourcePath' });
      continue;
    }

    let projected;
    try {
      projected = projectSpec(sourcePath);
    } catch (err) {
      report.push({ name, status: 'error', reason: err.message });
      continue;
    }

    // Merge props additively.
    const propsResult = mergePropsAdditive(spec.props, projected.props);

    // Merge variantAxes / compoundMembers / allowedChildren preserving curator.
    const axesResult = mergeArrayAdditive(spec.variantAxes, projected.variantAxes);
    const allowedResult = mergeArrayAdditive(spec.allowedChildren, projected.allowedChildren);
    // compoundMembers is purely additive metadata: only set if missing.
    const hadCompound = Array.isArray(spec.compoundMembers) && spec.compoundMembers.length > 0;

    const before = JSON.stringify({
      props: spec.props || {},
      variantAxes: spec.variantAxes || [],
      allowedChildren: spec.allowedChildren || [],
      compoundMembers: spec.compoundMembers || [],
    });

    spec.props = propsResult.props;
    if (axesResult.source === 'projected' && projected.variantAxes.length > 0) {
      spec.variantAxes = projected.variantAxes;
    }
    if (allowedResult.source === 'projected' && !Array.isArray(spec.allowedChildren)) {
      spec.allowedChildren = projected.allowedChildren;
    }
    if (!hadCompound && Array.isArray(projected.compoundMembers) && projected.compoundMembers.length > 0) {
      spec.compoundMembers = projected.compoundMembers;
    }
    if (!spec.sourcePath && projected.sourcePath) {
      spec.sourcePath = projected.sourcePath;
    }

    const after = JSON.stringify({
      props: spec.props || {},
      variantAxes: spec.variantAxes || [],
      allowedChildren: spec.allowedChildren || [],
      compoundMembers: spec.compoundMembers || [],
    });

    report.push({
      name,
      status: before === after ? 'unchanged' : 'merged',
      propsAdded: propsResult.added,
      propsPreserved: propsResult.preserved,
      axesSource: axesResult.source,
    });
  }

  if (apply) {
    fsWriteFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  }

  return { manifest, report };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function printDiff(name, diffs) {
  if (diffs.length === 0) {
    console.log(`OK ${name} — projection round-trips`);
    return;
  }
  console.log(`✗ ${name} — ${diffs.length} drift(s):`);
  for (const d of diffs) {
    console.log(`  ${d.field}`);
    if (d.projectedExtra?.length) {
      console.log(`    in source, missing from manifest: ${JSON.stringify(d.projectedExtra)}`);
    }
    if (d.manifestExtra?.length) {
      console.log(`    in manifest, missing from source: ${JSON.stringify(d.manifestExtra)}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  node scripts/project-component-spec.mjs <path.tsx>
  node scripts/project-component-spec.mjs --verify-roundtrip <path.tsx>
  node scripts/project-component-spec.mjs --verify-all
  node scripts/project-component-spec.mjs --bulk-merge [--apply] [--tiers=primitive,pattern]`);
    process.exit(0);
  }

  if (args[0] === '--bulk-merge') {
    const apply = args.includes('--apply');
    const tiersArg = args.find((a) => a.startsWith('--tiers='));
    const tiers = tiersArg ? tiersArg.slice('--tiers='.length).split(',') : ['primitive'];
    const { report } = bulkMergeManifest({ apply, tiers });
    let merged = 0;
    let unchanged = 0;
    let skipped = 0;
    let errored = 0;
    for (const row of report) {
      const tag = row.status === 'merged' ? '+' : row.status === 'unchanged' ? '=' : row.status === 'skipped' ? '-' : '!';
      const detail = row.status === 'merged'
        ? ` props +${row.propsAdded}/preserved ${row.propsPreserved} axes:${row.axesSource}`
        : row.status === 'error'
          ? ` ${row.reason}`
          : row.status === 'skipped'
            ? ` ${row.reason}`
            : '';
      console.log(`${tag} ${row.name}${detail}`);
      if (row.status === 'merged') merged += 1;
      else if (row.status === 'unchanged') unchanged += 1;
      else if (row.status === 'skipped') skipped += 1;
      else errored += 1;
    }
    console.log(`\nbulk-merge tiers=${tiers.join(',')}: merged=${merged} unchanged=${unchanged} skipped=${skipped} errored=${errored} ${apply ? '(written)' : '(dry run)'}`);
    process.exit(errored > 0 ? 1 : 0);
  }

  if (args[0] === '--verify-all') {
    let totalDiffs = 0;
    for (const path of FLAGSHIPS) {
      const projected = projectSpec(path);
      const diffs = diffAgainstManifest(projected);
      printDiff(projected.name, diffs);
      totalDiffs += diffs.length;
    }
    process.exit(totalDiffs === 0 ? 0 : 1);
  }

  if (args[0] === '--verify-roundtrip') {
    const target = args[1];
    if (!target) {
      console.error('Error: --verify-roundtrip requires a path argument');
      process.exit(2);
    }
    const projected = projectSpec(target);
    const diffs = diffAgainstManifest(projected);
    printDiff(projected.name, diffs);
    process.exit(diffs.length === 0 ? 0 : 1);
  }

  // Default: print projected spec as JSON.
  const projected = projectSpec(args[0]);
  console.log(JSON.stringify(projected, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { diffAgainstManifest, FLAGSHIPS, IGNORED_PROPS, TOLERATED_DRIFT };
