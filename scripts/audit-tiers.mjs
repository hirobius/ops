#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-tiers.mjs
 *
 * Heuristic tier classifier for every src/app/components/Hds*.tsx
 * (and recursive subdirs like src/app/components/lab/). Proposes one
 * of: primitive | pattern | template | utility.
 *
 * Output: docs/ai/TIER_AUDIT.md (draft markdown table for human
 * review per the 8-X cluster plan). Honors a `@tier <value>` JSDoc
 * tag at the top of source as a hard override; honors `@doc-exempt`
 * as a strong utility signal. Heuristics misclassify boundary cases
 * by design — fail-closed default is `utility` (was `experiment`
 * before 8x-6 collapsed the tier model).
 *
 * Usage:
 *   node scripts/audit-tiers.mjs            # write the audit table
 *   node scripts/audit-tiers.mjs --dry-run  # print summary, write nothing
 *   node scripts/audit-tiers.mjs --apply    # write @tier JSDoc tag into
 *                                           # every Hds*.tsx AND set tier
 *                                           # on every manifest spec
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS_DIR = path.join(ROOT, 'src/app/components');
const MANIFEST_PATH = path.join(ROOT, 'public/hds-manifest.json');
const AUDIT_PATH = path.join(ROOT, 'docs/ai/TIER_AUDIT.md');
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

const TIERS = ['primitive', 'pattern', 'template', 'utility'];
const TIER_SET = new Set(TIERS);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /^Hds[A-Z].*\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

function topJSDoc(source) {
  const m = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  return m ? m[1] : '';
}

function tierOverride(source) {
  const m = topJSDoc(source).match(/@tier\s+(\w+)/);
  if (!m) return null;
  return TIER_SET.has(m[1]) ? m[1] : null;
}

function isDocExempt(source) {
  return /@doc-exempt/.test(topJSDoc(source));
}

function importedHdsComponents(source) {
  const set = new Set();
  const stmts = source.match(/import[\s\S]*?from\s+['"][^'"]+['"]/g) || [];
  for (const stmt of stmts) {
    for (const name of stmt.match(/\bHds[A-Z]\w*\b/g) || []) {
      // Type imports like HdsButtonProps / CardVariant aren't components — skip.
      if (/Props$/.test(name) || /Variant$/.test(name) || /State$/.test(name)) continue;
      set.add(name);
    }
  }
  return [...set];
}

function hasPropsInterface(source, name) {
  if (new RegExp(`(?:interface|type)\\s+${name}Props\\b`).test(source)) return true;
  const unprefixed = name.replace(/^Hds/, '');
  if (unprefixed && new RegExp(`(?:interface|type)\\s+${unprefixed}Props\\b`).test(source)) return true;
  // Inline-typed function signatures: `function HdsX({...}: { ... })` or arrow `({ ... }: <Type>)`.
  if (new RegExp(`function\\s+${name}\\s*\\([^)]*:\\s*\\{`).test(source)) return true;
  if (new RegExp(`(?:const|let)\\s+${name}\\s*[:=][\\s\\S]{0,200}\\(\\s*\\{[^}]*\\}\\s*:`).test(source)) return true;
  // Final fallback: any *Props interface/type declared in the file. The codebase varies between
  // `HdsXProps`, `<unprefixed>Props`, and short forms like `NavProps` — if any Props shape exists,
  // the component has a typed prop API.
  if (/(?:^|\n)\s*(?:export\s+)?(?:interface|type)\s+\w+Props\b/.test(source)) return true;
  return false;
}

function hasVariantProp(source) {
  return /\bvariant\??\s*:/.test(source);
}

function isClassErrorBoundary(source) {
  return /componentDidCatch\s*\(/.test(source) || /getDerivedStateFromError/.test(source);
}

function isBarrelLike(source, name) {
  const reexports = (source.match(/^export\s*\*\s*from/gm) || []).length;
  if (reexports >= 1) return true;
  const namedExports = source.match(/^export\s+(?:const|function|class)\s+(\w+)/gm) || [];
  if (namedExports.length < 3) return false;
  return !new RegExp(`export\\s+(?:default\\s+)?(?:const|function|class)\\s+${name}\\b`).test(source);
}

function isHooksOnly(source) {
  const matches = [...source.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)];
  if (matches.length === 0) return false;
  return matches.every((m) => /^use[A-Z]/.test(m[1]));
}

function classifyByPath(file) {
  const rel = path.relative(ROOT, file);
  if (rel.includes(`${path.sep}lab${path.sep}`) || rel.includes('/lab/')) return 'utility';
  return null;
}

function classifyByCategory(category) {
  if (category === 'Lab' || category === 'Compiler') return 'utility';
  return null;
}

function isTemplateName(name) {
  return /(Layout|Pattern|Page|Shell|AppShell)$/.test(name);
}

function importsShellComponent(source) {
  return /\bHds(AppShell|Surface|SideNav|SidebarNav|ShellControls|MobiusShellLayer)\b/.test(source);
}

function classify(file, manifest) {
  const source = fs.readFileSync(file, 'utf8');
  const name = path.basename(file).replace(/\.tsx$/, '');
  const spec = manifest.componentSpecs?.[name] || {};
  const reasons = [];

  const override = tierOverride(source);
  if (override) {
    reasons.push('@tier JSDoc override');
    return { name, file, tier: override, override: true, confidence: 'high', reasons };
  }

  const byPath = classifyByPath(file);
  if (byPath) {
    reasons.push('source under /lab/ subdir');
    return { name, file, tier: byPath, override: false, confidence: 'high', reasons };
  }

  const byCategory = classifyByCategory(spec.category);
  if (byCategory) {
    reasons.push(`manifest category=${spec.category}`);
    return { name, file, tier: byCategory, override: false, confidence: 'high', reasons };
  }

  if (isDocExempt(source)) {
    reasons.push('@doc-exempt JSDoc tag');
    return { name, file, tier: 'utility', override: false, confidence: 'high', reasons };
  }
  if (isClassErrorBoundary(source)) {
    reasons.push('class component with componentDidCatch / getDerivedStateFromError');
    return { name, file, tier: 'utility', override: false, confidence: 'high', reasons };
  }
  if (isHooksOnly(source)) {
    reasons.push('hooks-only module (every export starts with `use`)');
    return { name, file, tier: 'utility', override: false, confidence: 'high', reasons };
  }
  if (isBarrelLike(source, name) && !hasPropsInterface(source, name)) {
    reasons.push(`barrel-like (≥3 sibling exports or re-export) without ${name}Props interface`);
    return { name, file, tier: 'utility', override: false, confidence: 'medium', reasons };
  }

  if (isTemplateName(name) && importsShellComponent(source)) {
    reasons.push(`name ends in Layout/Pattern/Page/Shell + imports shell-component`);
    return { name, file, tier: 'template', override: false, confidence: 'medium', reasons };
  }

  const imports = importedHdsComponents(source).filter((n) => n !== name);
  if (imports.length >= 2) {
    const sample = imports.slice(0, 6).join(', ') + (imports.length > 6 ? ', …' : '');
    reasons.push(`composes ${imports.length} Hds* components (${sample})`);
    return {
      name,
      file,
      tier: 'pattern',
      override: false,
      confidence: imports.length >= 3 ? 'high' : 'medium',
      reasons,
    };
  }

  const hasProps = hasPropsInterface(source, name);
  const hasVariants = hasVariantProp(source);

  if (imports.length === 1 && /(Group|Stack|List|Row|Bar|Set|Tray|Field|Cluster)$/.test(name)) {
    reasons.push(
      `composes 1 Hds* component (${imports[0]}); name suggests composition — primitive/pattern boundary, please confirm`,
    );
    return { name, file, tier: 'primitive', override: false, confidence: 'low', reasons };
  }

  if (hasProps && hasVariants) {
    reasons.push('has Props interface + variant prop');
    return { name, file, tier: 'primitive', override: false, confidence: 'high', reasons };
  }
  if (hasProps) {
    reasons.push('has Props interface, no variants — likely primitive');
    return { name, file, tier: 'primitive', override: false, confidence: 'medium', reasons };
  }
  reasons.push('no Props interface and no other strong signal — manual review');
  return { name, file, tier: 'primitive', override: false, confidence: 'low', reasons };
}

function tally(results) {
  const counts = { primitive: 0, pattern: 0, template: 0, utility: 0 };
  for (const r of results) counts[r.tier]++;
  return counts;
}

function summarize(counts, total) {
  return (
    `Audit proposes: ${counts.primitive} primitive, ${counts.pattern} pattern, ` +
    `${counts.template} template, ${counts.utility} utility (total ${total})`
  );
}

function renderMarkdown(results, manifest) {
  const counts = tally(results);
  const lines = [];
  lines.push('# Tier Audit (8x-2)');
  lines.push('');
  lines.push(
    'Auto-generated by `node scripts/audit-tiers.mjs` from heuristics over `src/app/components/Hds*.tsx`. **Draft for review** — heuristics misclassify boundary cases by design. Reconcile with `@tier <value>` JSDoc at the top of any source file to lock its classification (override is honored on the next run).',
  );
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Manifest: ${Object.keys(manifest.componentSpecs || {}).length} componentSpecs, audit walked ${results.length} source files`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- primitive:  ${counts.primitive}`);
  lines.push(`- pattern:    ${counts.pattern}`);
  lines.push(`- template:   ${counts.template}`);
  lines.push(`- utility:    ${counts.utility}`);
  lines.push(`- **total**:  ${results.length}`);
  lines.push('');
  lines.push('## Audit Table');
  lines.push('');
  lines.push('Sorted by tier, then alphabetically. `Override` column = heuristic was overridden by an explicit `@tier` tag in source.');
  lines.push('');
  lines.push('| Component | Tier | Override | Confidence | Reason |');
  lines.push('|-----------|------|----------|------------|--------|');
  const sorted = [...results].sort((a, b) => {
    const ti = TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
    return ti !== 0 ? ti : a.name.localeCompare(b.name);
  });
  for (const r of sorted) {
    const ov = r.override ? '✓' : '';
    const reason = r.reasons.join('; ').replace(/\|/g, '\\|');
    lines.push(`| \`${r.name}\` | ${r.tier} | ${ov} | ${r.confidence} | ${reason} |`);
  }
  lines.push('');
  lines.push('## Boundary / low-confidence cases');
  lines.push('');
  const lows = results.filter((r) => r.confidence === 'low');
  if (lows.length === 0) {
    lines.push('_None — every classification was high or medium confidence._');
  } else {
    lines.push(`${lows.length} cases need manual review before 8x-3 hard-fail promotion:`);
    lines.push('');
    for (const r of lows) {
      lines.push(`- \`${r.name}\` → proposed **${r.tier}** — ${r.reasons.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('## Resolution path');
  lines.push('');
  lines.push('1. Review every row above, especially boundary cases.');
  lines.push('2. For any row Adrian disagrees with, add `@tier <value>` JSDoc at the top of the source file.');
  lines.push('3. Re-run `node scripts/audit-tiers.mjs` to refresh this table.');
  lines.push('4. When the table is fully ratified, 8x-3 promotes `tier` to required in `validate-manifest.mjs` and 8x-4 surfaces deletion candidates from the orphan list (specs without a source file).');
  lines.push('');
  return lines.join('\n');
}

function injectTierTag(source, tier) {
  const m = source.match(/^(\s*\/\*\*)([\s\S]*?)(\s*\*\/)/);
  if (!m) {
    return `/**\n * @tier ${tier}\n */\n` + source;
  }
  const [whole, open, body, close] = m;

  if (/@tier\s+\w+/.test(body)) {
    const newBody = body.replace(/@tier\s+\w+/, `@tier ${tier}`);
    return source.replace(whole, open + newBody + close);
  }

  const lines = body.split('\n');
  const categoryIdx = lines.findIndex((l) => /@category\s/.test(l));
  if (categoryIdx >= 0) {
    const prefixMatch = lines[categoryIdx].match(/^(\s*\*\s*)/);
    const prefix = prefixMatch ? prefixMatch[1] : ' * ';
    lines.splice(categoryIdx + 1, 0, `${prefix}@tier ${tier}`);
    return source.replace(whole, open + lines.join('\n') + close);
  }

  const sampleLine = lines.find((l) => /^\s*\*\s/.test(l));
  const prefix = sampleLine ? sampleLine.match(/^(\s*\*\s)/)[1] : ' * ';
  if (lines.length > 1) {
    lines.splice(lines.length - 1, 0, `${prefix}@tier ${tier}`);
  } else {
    lines.push(`${prefix}@tier ${tier}`);
  }
  return source.replace(whole, open + lines.join('\n') + close);
}

function defaultTierForSourceless(name, spec) {
  if (spec.category === 'Lab' || spec.category === 'Compiler') return 'utility';
  if (typeof spec.filePath === 'string') {
    if (/(Layout|Shell)\.tsx$/.test(spec.filePath)) return 'template';
    if (/Page\.tsx$/.test(spec.filePath)) return 'template';
  }
  if (/^(get|default|use)[A-Z]/.test(name)) return 'utility';
  if (typeof spec.category === 'string' && /^Doc Utilities$/.test(spec.category)) return 'utility';
  return 'utility';
}

function applyTierTags(results) {
  let written = 0;
  for (const r of results) {
    const source = fs.readFileSync(r.file, 'utf8');
    const next = injectTierTag(source, r.tier);
    if (next !== source) {
      fs.writeFileSync(r.file, next);
      written += 1;
    }
  }
  return written;
}

function applyManifestTiers(results, manifest) {
  const verdictByName = new Map(results.map((r) => [r.name, r.tier]));
  let updated = 0;
  let defaulted = 0;

  const specs = manifest.componentSpecs ?? {};
  for (const [name, spec] of Object.entries(specs)) {
    const verdict = verdictByName.get(name);
    if (verdict) {
      if (spec.tier !== verdict) {
        spec.tier = verdict;
        updated += 1;
      }
      continue;
    }
    if (typeof spec.tier === 'string' && spec.tier.length > 0) continue;
    spec.tier = defaultTierForSourceless(name, spec);
    defaulted += 1;
  }

  return { updated, defaulted };
}

function applyMode(results, manifest) {
  const written = applyTierTags(results);
  const { updated, defaulted } = applyManifestTiers(results, manifest);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `Apply: wrote @tier in ${written} source file(s); manifest tier: ${updated} updated from audit, ${defaulted} defaulted on source-less specs.`,
  );
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const files = walk(COMPONENTS_DIR).sort();
  const results = files.map((f) => classify(f, manifest));
  const counts = tally(results);
  const summary = summarize(counts, results.length);

  if (DRY_RUN) {
    console.log(summary);
    const lows = results.filter((r) => r.confidence === 'low');
    if (lows.length > 0) {
      console.log(`Boundary / low-confidence cases: ${lows.length}`);
      for (const r of lows) console.log(`  - ${r.name} → ${r.tier} (${r.reasons[0]})`);
    }
    return;
  }

  if (APPLY) {
    applyMode(results, manifest);
    console.log(summary);
    return;
  }

  const md = renderMarkdown(results, manifest);
  fs.writeFileSync(AUDIT_PATH, md);
  console.log(`Wrote ${path.relative(ROOT, AUDIT_PATH)} — ${summary}`);
}

main();
