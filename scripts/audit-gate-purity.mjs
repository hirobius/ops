#!/usr/bin/env node
/**
 * audit-gate-purity — static scan for impurity patterns in every registered gate.
 *
 * Goal of the deterministic-gates roadmap: a gate's behaviour should depend only
 * on its inputs (the source tree at HEAD). If a gate consults Date.now,
 * Math.random, the network, or arbitrary env vars, two runs against the same
 * tree can disagree — which is the opposite of "deterministic guardrail."
 *
 * This script walks docs/guardrails/registry.json, opens each gate's source
 * file, and grep-greps for known impurity patterns. Each finding is reported
 * with file path, line number, category, and matched snippet. A gate may
 * declare a `pureExceptions` array in registry to document intentional
 * impurities (e.g. an --update flag that legitimately writes); the audit
 * still records the finding but classifies the gate as EXEMPTED rather
 * than IMPURE.
 *
 * Output:
 *   - stdout: per-gate verdicts + summary
 *   - docs/guardrails/purity-audit.md: full report (when run with --report)
 *
 * Exit code:
 *   0 always (this is an audit, not an enforcer; promote to gate via 13g-12)
 *   1 if --strict and any IMPURE-without-exemption findings
 *
 * @category Audit
 * @tier deterministic-gates
 *
 * Wired by: docs/guardrails/registry.json (firingChannel: ci-pr)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitResult } from './lib/gate-output.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const REGISTRY_PATH = resolve(REPO_ROOT, 'docs/guardrails/registry.json');
const REPORT_PATH   = resolve(REPO_ROOT, 'docs/guardrails/purity-audit.md');

// ── Allowlist for process.env ─────────────────────────────────────────────────
// Anything outside this list is flagged as an env-impurity finding.

const ENV_ALLOWLIST = new Set([
  'NODE_ENV',          // mode detection
  'CI',                // CI detection
  'HOME',              // user home (read-only)
  'npm_lifecycle_event', // npm-script context
  'PATH',              // exec lookup (read-only)
  'PWD',               // working dir (read-only)
  'GITHUB_ACTIONS',    // CI sub-flag
  'GITHUB_SHA',        // commit ref (CI provides)
  'GITHUB_REF',        // branch ref (CI provides)
  'GITHUB_TOKEN',      // CI auth
  'TZ',                // timezone (deterministic when set)
  'LANG',              // locale (read-only)
  'LC_ALL',            // locale (read-only)
]);

// ── Impurity pattern catalogue ────────────────────────────────────────────────
// Each pattern: { category, label, regex, why }.
//   category — used to match against `pureExceptions` entries in registry.
//   label    — human-readable name in the report.
//   regex    — applied per-line; first capture group is the matched bit.
//   why      — short rationale for why this is impure.

const PATTERNS = [
  // ── Mutation (filesystem writes) ──────────────────────────────────────────
  {
    category: 'mutation',
    label: 'fs.writeFileSync',
    regex: /\bfs\.writeFileSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.appendFileSync',
    regex: /\bfs\.appendFileSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.unlinkSync',
    regex: /\bfs\.unlinkSync\s*\(/,
    why: 'deletes from the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.rmSync',
    regex: /\bfs\.rmSync\s*\(/,
    why: 'deletes from the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.mkdirSync',
    regex: /\bfs\.mkdirSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.renameSync',
    regex: /\bfs\.renameSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.copyFileSync',
    regex: /\bfs\.copyFileSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.chmodSync',
    regex: /\bfs\.chmodSync\s*\(/,
    why: 'mutates the working tree',
  },
  {
    category: 'mutation',
    label: 'fs.promises.writeFile',
    regex: /\bfs\.promises\.writeFile\s*\(|\bawait\s+writeFile\s*\(/,
    why: 'mutates the working tree (async)',
  },

  // ── Non-determinism (clock + random) ──────────────────────────────────────
  {
    category: 'time',
    label: 'Date.now',
    regex: /\bDate\.now\s*\(/,
    why: 'wall-clock — output varies across runs',
  },
  {
    category: 'time',
    label: 'new Date()',
    regex: /\bnew\s+Date\s*\(\s*\)/,
    why: 'wall-clock — output varies across runs',
  },
  {
    category: 'random',
    label: 'Math.random',
    regex: /\bMath\.random\s*\(/,
    why: 'non-deterministic — output varies across runs',
  },

  // ── Network (out-of-tree dependencies) ────────────────────────────────────
  {
    category: 'network',
    label: "import 'http' / 'https'",
    regex: /\bfrom\s+['"]node:(?:http|https)['"]|\bfrom\s+['"](?:http|https)['"]/,
    why: 'fetches data outside the working tree',
  },
  {
    category: 'network',
    label: "import 'fetch' / axios / node-fetch",
    regex: /\bfrom\s+['"](?:node-fetch|axios|undici)['"]/,
    why: 'fetches data outside the working tree',
  },
  {
    category: 'network',
    label: 'fetch(',
    regex: /(?<![\w$])fetch\s*\(/,
    why: 'fetches data outside the working tree',
  },
];

// process.env scan is special — we extract the variable name and check allowlist.
const ENV_REGEX = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g;

// ── Argv ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const strict   = argv.includes('--strict');
const writeRpt = argv.includes('--report');
const jsonMode = argv.includes('--json');

// ── Load registry ─────────────────────────────────────────────────────────────

if (!existsSync(REGISTRY_PATH)) {
  console.error(`ERROR: registry not found at ${REGISTRY_PATH}`);
  process.exit(2);
}

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const gates = registry.gates ?? [];

if (gates.length === 0) {
  console.error('ERROR: registry has no gates.');
  process.exit(2);
}

// ── Scan ──────────────────────────────────────────────────────────────────────

/**
 * @typedef Finding
 * @property {string} category
 * @property {string} label
 * @property {number} line
 * @property {string} snippet
 */

/**
 * @typedef GateResult
 * @property {string} id
 * @property {string} gateScript
 * @property {Finding[]} findings
 * @property {string[]} exceptions
 * @property {'PURE' | 'IMPURE' | 'EXEMPTED' | 'MISSING'} verdict
 */

/** @returns {GateResult} */
function scanGate(gate) {
  const scriptPath = resolve(REPO_ROOT, gate.gateScript);
  const result = {
    id: gate.id,
    gateScript: gate.gateScript,
    findings: [],
    exceptions: gate.pureExceptions ?? [],
    verdict: 'PURE',
  };

  if (!existsSync(scriptPath)) {
    result.verdict = 'MISSING';
    return result;
  }

  const src = readFileSync(scriptPath, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip block-comment lines and full-line comments — pattern in a comment
    // is not an actual call. Cheap heuristic: drop // ... and /* ... */ on a
    // single line. Multi-line block comments are not handled exhaustively
    // (rare in our scripts) — false-positives can be exempted via registry.
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

    for (const pat of PATTERNS) {
      if (pat.regex.test(stripped)) {
        result.findings.push({
          category: pat.category,
          label:    pat.label,
          line:     i + 1,
          snippet:  line.trim().slice(0, 120),
        });
      }
    }

    // process.env scan
    let m;
    const envRe = new RegExp(ENV_REGEX.source, 'g');
    while ((m = envRe.exec(stripped)) !== null) {
      const varName = m[1];
      if (!ENV_ALLOWLIST.has(varName)) {
        result.findings.push({
          category: 'env',
          label:    `process.env.${varName}`,
          line:     i + 1,
          snippet:  line.trim().slice(0, 120),
        });
      }
    }
  }

  if (result.findings.length === 0) {
    result.verdict = 'PURE';
    return result;
  }

  // Match findings against pureExceptions. An exception is a string like
  // "mutation: writes orchestration.json on --update flag" — the leading
  // category before the colon must match the finding's category.
  const exemptedCategories = new Set(
    result.exceptions
      .map(s => String(s).split(':')[0]?.trim().toLowerCase())
      .filter(Boolean),
  );

  const findingCategories = new Set(result.findings.map(f => f.category));
  const allCovered = [...findingCategories].every(c => exemptedCategories.has(c));

  result.verdict = allCovered ? 'EXEMPTED' : 'IMPURE';
  return result;
}

const results = gates.map(scanGate);

// ── Aggregates ────────────────────────────────────────────────────────────────

const counts = {
  PURE:     results.filter(r => r.verdict === 'PURE').length,
  IMPURE:   results.filter(r => r.verdict === 'IMPURE').length,
  EXEMPTED: results.filter(r => r.verdict === 'EXEMPTED').length,
  MISSING:  results.filter(r => r.verdict === 'MISSING').length,
  TOTAL:    results.length,
};

// ── JSON mode (per unit 13p-9) ───────────────────────────────────────────────
//
// Each per-gate finding becomes one Violation row. Verdict-level information
// stays in the row's `extra` fields so downstream consumers (closure plan,
// inventory) can group / filter by gate or verdict.

if (jsonMode) {
  const violations = [];
  for (const r of results) {
    if (r.verdict === 'PURE') continue; // only emit non-clean rows
    const severityForVerdict = r.verdict === 'IMPURE' ? 'warn'
      : r.verdict === 'EXEMPTED' ? 'baselined'
      : r.verdict === 'MISSING' ? 'error'
      : 'info';
    if (r.findings && r.findings.length > 0) {
      for (const f of r.findings) {
        violations.push({
          file: r.gateScript || '*',
          line: f.line ?? null,
          rule: `gate-purity-${f.category}`,
          severity: severityForVerdict,
          message: `${r.id}: ${f.label || f.category}`,
          gateId: r.id,
          verdict: r.verdict,
          category: f.category,
          snippet: f.snippet,
        });
      }
    } else {
      violations.push({
        file: r.gateScript || '*',
        line: null,
        rule: 'gate-purity-missing',
        severity: severityForVerdict,
        message: `${r.id}: ${r.verdict}`,
        gateId: r.id,
        verdict: r.verdict,
      });
    }
  }
  emitResult(
    {
      violations,
      summary: counts,
      ok: counts.IMPURE === 0 && counts.MISSING === 0,
    },
    true,
  );
  process.exit(strict && counts.IMPURE > 0 ? 1 : 0);
}

// ── Stdout report ─────────────────────────────────────────────────────────────

console.log('audit-gate-purity — registered gates scanned for impurity patterns');
console.log(`scanned: ${counts.TOTAL}`);
console.log(`  PURE:     ${counts.PURE}`);
console.log(`  EXEMPTED: ${counts.EXEMPTED}  (impurity present + documented in pureExceptions)`);
console.log(`  IMPURE:   ${counts.IMPURE}    (impurity present, NOT documented)`);
console.log(`  MISSING:  ${counts.MISSING}   (gateScript file does not exist)`);
console.log('');

const impure = results.filter(r => r.verdict === 'IMPURE');
if (impure.length > 0) {
  console.log('IMPURE gates (need pureExceptions or refactor):');
  for (const r of impure) {
    const cats = [...new Set(r.findings.map(f => f.category))].sort();
    console.log(`  ✗ ${r.id}  (${cats.join(', ')})`);
  }
  console.log('');
}

const missing = results.filter(r => r.verdict === 'MISSING');
if (missing.length > 0) {
  console.log('MISSING gates (script file does not exist — registry drift):');
  for (const r of missing) {
    console.log(`  ? ${r.id}  → ${r.gateScript}`);
  }
  console.log('');
}

// ── Markdown report ───────────────────────────────────────────────────────────

if (writeRpt) {
  const lines = [];
  lines.push('# Gate Purity Audit');
  lines.push('');
  lines.push(`Generated by \`scripts/audit-gate-purity.mjs\`. Scans every gate in \`docs/guardrails/registry.json\` for impurity patterns: filesystem mutation, wall-clock / random, network access, env reads outside the allowlist.`);
  lines.push('');
  lines.push(`A gate may legitimately need to mutate (e.g. an \`--update\` flag), read the clock (e.g. log timestamps), or call out (e.g. fetch a remote schema). Document the exception in the registry: add \`pureExceptions: ["category: rationale", ...]\` next to the gate. The audit then records the finding but classifies the gate as **EXEMPTED**.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Verdict | Count |`);
  lines.push(`|---|---:|`);
  lines.push(`| **PURE** — no impurity patterns found | ${counts.PURE} |`);
  lines.push(`| **EXEMPTED** — impurity present, documented in \`pureExceptions\` | ${counts.EXEMPTED} |`);
  lines.push(`| **IMPURE** — impurity present, **NOT** documented | ${counts.IMPURE} |`);
  lines.push(`| **MISSING** — \`gateScript\` file does not exist | ${counts.MISSING} |`);
  lines.push(`| **TOTAL** | ${counts.TOTAL} |`);
  lines.push('');
  lines.push('## Patterns scanned');
  lines.push('');
  lines.push('| Category | Pattern | Why it matters |');
  lines.push('|---|---|---|');
  for (const p of PATTERNS) {
    lines.push(`| \`${p.category}\` | \`${p.label}\` | ${p.why} |`);
  }
  lines.push(`| \`env\` | \`process.env.X\` (X not in allowlist) | external state — varies across machines |`);
  lines.push('');
  lines.push(`**Env allowlist:** ${[...ENV_ALLOWLIST].sort().map(x => `\`${x}\``).join(', ')}`);
  lines.push('');

  if (counts.IMPURE > 0) {
    lines.push('## IMPURE gates');
    lines.push('');
    lines.push('Each gate below has at least one finding in a category not covered by `pureExceptions`. Either add the exception (with rationale) to the registry or refactor the gate.');
    lines.push('');
    for (const r of results.filter(x => x.verdict === 'IMPURE')) {
      lines.push(`### \`${r.id}\``);
      lines.push('');
      lines.push(`Source: \`${r.gateScript}\``);
      lines.push('');
      lines.push('| Line | Category | Pattern | Snippet |');
      lines.push('|---:|---|---|---|');
      for (const f of r.findings) {
        const safeSnippet = f.snippet.replace(/\|/g, '\\|');
        lines.push(`| ${f.line} | \`${f.category}\` | \`${f.label}\` | \`${safeSnippet}\` |`);
      }
      if (r.exceptions.length > 0) {
        lines.push('');
        lines.push('**Existing pureExceptions:**');
        for (const e of r.exceptions) lines.push(`- ${e}`);
      }
      lines.push('');
    }
  }

  if (counts.EXEMPTED > 0) {
    lines.push('## EXEMPTED gates');
    lines.push('');
    lines.push('Findings present, but every category is covered by a `pureExceptions` entry.');
    lines.push('');
    lines.push('| Gate | Categories | Exceptions |');
    lines.push('|---|---|---|');
    for (const r of results.filter(x => x.verdict === 'EXEMPTED')) {
      const cats = [...new Set(r.findings.map(f => f.category))].sort();
      const excs = r.exceptions.map(e => `\`${String(e).replace(/`/g, '\\`')}\``).join('<br>');
      lines.push(`| \`${r.id}\` | ${cats.join(', ')} | ${excs} |`);
    }
    lines.push('');
  }

  if (counts.MISSING > 0) {
    lines.push('## MISSING gates');
    lines.push('');
    lines.push('Registry references a script that does not exist. Either fix the path or remove the entry.');
    lines.push('');
    for (const r of results.filter(x => x.verdict === 'MISSING')) {
      lines.push(`- \`${r.id}\` → \`${r.gateScript}\``);
    }
    lines.push('');
  }

  if (counts.PURE > 0) {
    lines.push('## PURE gates');
    lines.push('');
    lines.push('No impurity patterns detected. Deterministic by static analysis.');
    lines.push('');
    const pureIds = results.filter(x => x.verdict === 'PURE').map(x => `- \`${x.id}\``);
    lines.push(...pureIds);
    lines.push('');
  }

  lines.push('## Re-running');
  lines.push('');
  lines.push('```');
  lines.push('node scripts/audit-gate-purity.mjs --report          # regenerate this file');
  lines.push('node scripts/audit-gate-purity.mjs --strict          # exit 1 on any IMPURE');
  lines.push('```');
  lines.push('');

  writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
  console.log(`report → ${relative(REPO_ROOT, REPORT_PATH)}`);
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (strict && counts.IMPURE > 0) {
  process.exit(1);
}
process.exit(0);
