#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-script-index.mjs
 *
 * Generates a machine- + human-readable index of every script in scripts/ so an
 * agent (or human) can find "the script that does X" without grepping ~180
 * files. Merges three sources:
 *   - each script's JSDoc/comment header  → one-line purpose
 *   - package.json "scripts"              → pnpm alias(es)
 *   - docs/guardrails/registry.json       → firing channel + severity (gates)
 *
 * Scripts are grouped by a canonical prefix TAXONOMY (see below) so the
 * historically-interchangeable check-/audit-/validate-/verify- families gain a
 * documented, single meaning each.
 *
 * Outputs (DETERMINISTIC — no timestamps, so re-runs don't churn the diff):
 *   - scripts/INDEX.json   machine-readable
 *   - scripts/INDEX.md     human-readable, grouped by category, taxonomy legend
 *
 * Usage: node scripts/generate-script-index.mjs
 * Or:    pnpm scripts:index
 *
 * Candidate #13 (+#15 taxonomy) — AI-navigability of the scripts/ toolchain.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');

// ── Prefix taxonomy (Candidate #15) ──────────────────────────────────────────
// One canonical meaning per verb-prefix. The check/audit split tracks the
// registry reality: check-* are strict deterministic gates (mostly pre-commit/
// CI), audit-* are broader health/compliance scans (mostly soft/manual).
const TAXONOMY = [
  [
    'check',
    'gate',
    'Strict deterministic gate — fast pass/fail, fires on a channel (pre-commit / CI).',
  ],
  [
    'audit',
    'audit',
    'Health / compliance scan — broader, often slower or advisory (soft / manual channel).',
  ],
  [
    'validate',
    'validate',
    'Schema / structure validation — asserts a file or JSON matches its contract.',
  ],
  ['verify', 'verify', 'Post-build verification — confirms a build step produced correct output.'],
  ['build', 'build', 'Artifact builder — compiles source into a committed or served artifact.'],
  [
    'generate',
    'generate',
    'Content generator — derives a file (manifest, docs, index) from source.',
  ],
  ['sync', 'sync', 'Synchronizer — reconciles one source of truth into another.'],
  ['test', 'test', 'Test runner — integration / smoke / unit checks.'],
  ['figma', 'figma', 'Figma bridge — design-system sync, diff, or canvas ops.'],
];
const PREFIX_CATEGORY = Object.fromEntries(TAXONOMY.map(([p, cat]) => [p, cat]));
// Display order for INDEX.md sections (categories not listed fall under 'other').
const CATEGORY_ORDER = [
  'gate',
  'audit',
  'validate',
  'verify',
  'build',
  'generate',
  'sync',
  'test',
  'figma',
  'other',
];

// ── Purpose extraction ───────────────────────────────────────────────────────
const SECTION_RE =
  /^(Usage|Run|Or|Output|Outputs|Input|Inputs|Mode|Modes|Flag|Flags|Exit|Option|Options|Example|Examples|Wired|Category|Tier|What|Steps?|Behaviou?r|Notes?|Acceptance|Self|@)/i;

/**
 * Pull a one-line purpose out of a script's header. Handles the repo's JSDoc
 * convention (skips the @internal one-liner + the filename title line) and falls
 * back to leading `#` comments for shell scripts.
 */
function extractPurpose(src, base) {
  const lines = src.split('\n');

  // Collect the first descriptive comment block.
  let block = [];
  let inBlock = false;
  let blockLines = [];
  const blocks = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!inBlock && trimmed.startsWith('/**')) {
      if (trimmed.includes('*/')) continue; // single-line (e.g. @internal) — skip
      inBlock = true;
      blockLines = [];
      continue;
    }
    if (inBlock) {
      if (trimmed.includes('*/')) {
        inBlock = false;
        blocks.push(blockLines);
        continue;
      }
      blockLines.push(line.replace(/^\s*\*\s?/, ''));
    }
  }
  block = blocks.find((b) => b.filter((x) => x.trim()).length >= 1) || [];

  // Shell / no-JSDoc fallback: leading `#` comment lines after the shebang.
  if (block.length === 0) {
    for (const raw of lines) {
      const t = raw.trim();
      if (t.startsWith('#!')) continue;
      if (t.startsWith('#')) block.push(t.replace(/^#+\s?/, ''));
      else if (block.length) break;
      else if (t) break;
    }
  }

  const purpose = [];
  let titleFallback = '';
  for (const l of block) {
    const t = l.trim();
    if (!t) {
      if (purpose.length) break;
      continue;
    }
    // Strip leading decoration (box-drawing / dashes / bullets) before testing,
    // so a banner like "─── ACCEPTANCE CRITERIA ───" is recognised as a section.
    const core = t.replace(/^[─━=\-_*•·\s]+/, '').trim();
    if (!core) continue; // pure separator
    if (SECTION_RE.test(core)) break; // section / banner header
    // Filename title line ("scripts/foo.mjs" / "foo.mjs").
    if (core.toLowerCase().includes(base.toLowerCase())) continue;
    // Em-dash heading ("Hirobius Design System — Token Build Script") — keep its
    // tail as a fallback, then skip in favour of the real prose that follows.
    if (!purpose.length && core.includes(' — ') && core.length < 70 && !/[.:]$/.test(core)) {
      titleFallback = core.split(' — ').pop().trim();
      continue;
    }
    purpose.push(core);
    if (purpose.join(' ').length > 150) break;
  }

  let p = purpose.join(' ').replace(/\s+/g, ' ').trim() || titleFallback;
  if (p.length > 220) p = p.slice(0, 217).replace(/\s+\S*$/, '') + '…';
  return p || '(no header description)';
}

// ── Cross-reference sources ──────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const aliasMap = {}; // scriptFile -> [pnpm alias, …]
for (const [alias, cmd] of Object.entries(pkg.scripts || {})) {
  for (const m of String(cmd).matchAll(/scripts\/([\w.-]+\.(?:mjs|js|sh))/g)) {
    (aliasMap[m[1]] ||= []).push(alias);
  }
}

const registry = JSON.parse(readFileSync(join(ROOT, 'docs/guardrails/registry.json'), 'utf8'));
const gateMap = {}; // scriptFile -> { channel, severity }
for (const g of registry.gates || []) {
  if (!g.gateScript) continue;
  const file = g.gateScript.replace(/^scripts\//, '');
  gateMap[file] = { channel: g.firingChannel, severity: g.severity ?? null };
}

// ── Build entries ────────────────────────────────────────────────────────────
const files = readdirSync(SCRIPTS)
  .filter((f) => /\.(mjs|js|sh)$/.test(f))
  .sort();

const entries = files.map((file) => {
  const src = readFileSync(join(SCRIPTS, file), 'utf8');
  const prefix = (file.match(/^([a-z]+)-/) || [])[1] || '';
  const category = PREFIX_CATEGORY[prefix] || 'other';
  return {
    name: file,
    category,
    prefix: prefix || null,
    purpose: extractPurpose(src, file),
    pnpm: (aliasMap[file] || []).sort(),
    gate: gateMap[file] || null,
  };
});

const categoryCounts = {};
for (const e of entries) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;

// ── Emit INDEX.json (deterministic) ──────────────────────────────────────────
const indexJson = {
  generatedBy: 'scripts/generate-script-index.mjs',
  note: 'Deterministic — regenerate with `pnpm scripts:index`. Do not edit by hand.',
  totalScripts: entries.length,
  taxonomy: Object.fromEntries(
    TAXONOMY.map(([prefix, category, meaning]) => [prefix, { category, meaning }]),
  ),
  categoryCounts,
  scripts: entries,
};
writeFileSync(join(SCRIPTS, 'INDEX.json'), JSON.stringify(indexJson, null, 2) + '\n');

// ── Emit INDEX.md ────────────────────────────────────────────────────────────
const md = [];
md.push('# scripts/ index');
md.push('');
md.push('> Generated by `scripts/generate-script-index.mjs` — **do not edit by hand**.');
md.push('> Regenerate with `pnpm scripts:index`. Deterministic (no timestamps), so it');
md.push('> only changes when scripts do.');
md.push('');
md.push(`**${entries.length} scripts** across ${Object.keys(categoryCounts).length} categories.`);
md.push('');
md.push('## Prefix taxonomy');
md.push('');
md.push('One canonical meaning per verb-prefix — pick the matching prefix when adding a script.');
md.push('');
md.push('| Prefix | Category | Meaning |');
md.push('| --- | --- | --- |');
for (const [prefix, category, meaning] of TAXONOMY) {
  md.push(`| \`${prefix}-\` | ${category} | ${meaning} |`);
}
md.push(
  '| _(other)_ | other | One-off utilities, middleware, and domain scripts without a taxonomy prefix. |',
);
md.push('');

const present = CATEGORY_ORDER.filter((c) => entries.some((e) => e.category === c));
for (const category of present) {
  const rows = entries.filter((e) => e.category === category);
  md.push(`## ${category} (${rows.length})`);
  md.push('');
  md.push('| Script | Purpose | pnpm | Fires |');
  md.push('| --- | --- | --- | --- |');
  for (const e of rows) {
    const aliases = e.pnpm.length ? e.pnpm.map((a) => `\`${a}\``).join(', ') : '—';
    const fires = e.gate
      ? `${e.gate.channel}${e.gate.severity ? ` · ${e.gate.severity}` : ''}`
      : '—';
    const purpose = e.purpose.replace(/\|/g, '\\|');
    md.push(`| \`${e.name}\` | ${purpose} | ${aliases} | ${fires} |`);
  }
  md.push('');
}
writeFileSync(join(SCRIPTS, 'INDEX.md'), md.join('\n'));

console.log(
  `✓ script index: ${entries.length} scripts → scripts/INDEX.json + scripts/INDEX.md ` +
    `(${present.map((c) => `${c}:${categoryCounts[c]}`).join(', ')})`,
);
