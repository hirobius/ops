#!/usr/bin/env node
/**
 * scripts/test-prompt-regression.mjs
 *
 * Regression suite for LLM prompt outputs.
 * Walks fixtures/llm-prompts/<slug>/ directories.
 * Each must contain:
 *   input.txt      — the user prompt
 *   expected.jsx   — the canonicalized golden (captured via --update)
 *
 * If expected.jsx is empty or starts with "# TODO", the fixture is SKIPPED
 * with a warning (don't fail CI — bridge may be offline).
 *
 * Flags:
 *   --update        Regenerate all expected.jsx files from live LLM output.
 *   --fixture <slug> Run only the named fixture.
 *   --verbose       Print diff context on failure.
 *
 * Usage:
 *   node scripts/test-prompt-regression.mjs
 *   node scripts/test-prompt-regression.mjs --update
 *   node scripts/test-prompt-regression.mjs --fixture login-form
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'llm-prompts');
const GENERATE_SCRIPT = path.join(ROOT, 'scripts', 'generate-to-figma.mjs');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const VERBOSE = args.includes('--verbose');
const FIXTURE_FILTER = (() => {
  const idx = args.indexOf('--fixture');
  return idx !== -1 ? args[idx + 1] : null;
})();

// ── Canonicalize JSX ─────────────────────────────────────────────────────────
//
// Normalizes LLM output so irrelevant formatting differences don't cause false
// positives. Sorting attribute keys and collapsing whitespace catches:
//   - Prop ordering changes (model emits fill before layout vs. after)
//   - Extra whitespace or newlines injected by the model
//   - Single vs. double quote variance in text content
//
// NOTE: This is intentionally conservative — it only normalizes things that
// are semantically equivalent. It does NOT rewrite prop values. If the model
// changes "heading3" → "heading2", that is a real regression and must fail.

/**
 * Parse JSX attributes into key-value pairs from a tag string like:
 *   layout="VERTICAL" fill="semantic.color.surface.raised" padding="32"
 */
function parseAttrs(attrString) {
  const attrs = {};
  // Match: key="value", key={value}, or key={true/false/number}
  const re = /([a-zA-Z][a-zA-Z0-9-]*)=(?:"([^"]*)"|(\{[^}]*\}))/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? `"${m[2]}"` : m[3];
    attrs[key] = val;
  }
  return attrs;
}

/**
 * Rebuild a sorted attribute string from a parsed attrs map.
 */
function serializeAttrs(attrs) {
  return Object.keys(attrs)
    .sort()
    .map((k) => `${k}=${attrs[k]}`)
    .join(' ');
}

/**
 * Canonicalize JSX:
 * 1. Sort attributes within each tag alphabetically.
 * 2. Collapse runs of whitespace (including newlines) to single space.
 * 3. Trim leading/trailing whitespace.
 */
function canonicalize(jsx) {
  if (!jsx || typeof jsx !== 'string') return '';

  // Collapse whitespace first (handles multi-line model output)
  let canon = jsx.replace(/\s+/g, ' ').trim();

  // Sort attributes inside each JSX opening tag.
  // Matches: <TagName attrs... > or <TagName attrs... />
  // We use a regex that captures: tag name + attr block + closing >
  canon = canon.replace(/<([A-Z][A-Za-z0-9]*)(\s[^>]*?)?\s*(\/?>)/g, (_, tagName, attrBlock, close) => {
    if (!attrBlock || attrBlock.trim() === '') {
      return `<${tagName}${close}`;
    }
    const attrs = parseAttrs(attrBlock);
    const sorted = serializeAttrs(attrs);
    return `<${tagName}${sorted ? ' ' + sorted : ''}${close}`;
  });

  return canon.trim();
}

// ── LLM call ─────────────────────────────────────────────────────────────────

function captureJsx(prompt) {
  try {
    const output = execFileSync(
      process.execPath,
      [GENERATE_SCRIPT, '--output-jsx-only', prompt],
      {
        encoding: 'utf8',
        timeout: 120_000,
        // Force temperature=0 for deterministic greedy decoding.
        // This suite tests system-prompt regressions, not model diversity —
        // greedy output is stable across runs for the same model + system prompt.
        env: { ...process.env, HDS_LLM_TEMPERATURE: '0' },
        // stderr flows through so user can see LLM errors
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    return output.trim();
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`LLM call failed: ${msg}`);
  }
}

// ── Diff helper ──────────────────────────────────────────────────────────────

function showDiff(expected, actual, verbose) {
  if (!verbose) return;
  // Simple line-diff: split on > to make each element visible
  const expectedLines = expected.replace(/></g, '>\n<').split('\n');
  const actualLines = actual.replace(/></g, '>\n<').split('\n');

  const maxLen = Math.max(expectedLines.length, actualLines.length);
  console.error('\n  EXPECTED vs ACTUAL (element-per-line):');
  for (let i = 0; i < maxLen; i++) {
    const e = expectedLines[i] ?? '(missing)';
    const a = actualLines[i] ?? '(missing)';
    const marker = e === a ? '  ' : '≠ ';
    console.error(`  ${marker}[${i}] E: ${e}`);
    if (e !== a) console.error(`  ${marker}[${i}] A: ${a}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`[test-prompt-regression] fixtures/llm-prompts/ not found — nothing to test.`);
    process.exit(0);
  }

  const entries = fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const filtered = FIXTURE_FILTER ? entries.filter((e) => e === FIXTURE_FILTER) : entries;

  if (filtered.length === 0) {
    console.error(`[test-prompt-regression] No fixture found matching "${FIXTURE_FILTER}".`);
    process.exit(1);
  }

  const results = { pass: 0, fail: 0, skip: 0, update: 0 };

  for (const slug of filtered) {
    const dir = path.join(FIXTURES_DIR, slug);
    const inputPath = path.join(dir, 'input.txt');
    const expectedPath = path.join(dir, 'expected.jsx');

    if (!fs.existsSync(inputPath)) {
      console.warn(`[SKIP] ${slug} — missing input.txt`);
      results.skip += 1;
      continue;
    }

    const prompt = fs.readFileSync(inputPath, 'utf8').trim();

    // Check for TODO / empty golden
    const existingExpected = fs.existsSync(expectedPath)
      ? fs.readFileSync(expectedPath, 'utf8').trim()
      : '';

    if (!UPDATE && (!existingExpected || existingExpected.startsWith('# TODO'))) {
      console.warn(`[SKIP] ${slug} — golden is empty or TODO (run with --update to capture)`);
      results.skip += 1;
      continue;
    }

    if (UPDATE) {
      process.stdout.write(`[UPDATE] ${slug} — capturing... `);
      try {
        const rawJsx = captureJsx(prompt);
        const canon = canonicalize(rawJsx);
        if (!canon) {
          console.log('EMPTY — skipped');
          results.skip += 1;
          continue;
        }
        fs.writeFileSync(expectedPath, canon + '\n', 'utf8');
        console.log('done');
        results.update += 1;
      } catch (err) {
        console.log(`FAILED — ${err.message}`);
        results.fail += 1;
      }
      continue;
    }

    // Compare mode
    process.stdout.write(`[TEST]   ${slug} — `);
    let rawJsx;
    try {
      rawJsx = captureJsx(prompt);
    } catch (err) {
      console.log(`FAIL (LLM error: ${err.message})`);
      results.fail += 1;
      continue;
    }

    const actualCanon = canonicalize(rawJsx);
    const expectedCanon = canonicalize(existingExpected);

    if (actualCanon === expectedCanon) {
      console.log('PASS');
      results.pass += 1;
    } else {
      console.log('FAIL');
      console.error(`  Canonicalized outputs differ for: ${slug}`);
      console.error(`  Expected length: ${expectedCanon.length}, Actual length: ${actualCanon.length}`);
      showDiff(expectedCanon, actualCanon, VERBOSE);
      if (!VERBOSE) {
        console.error('  (run with --verbose for element-level diff)');
      }
      results.fail += 1;
    }
  }

  const { pass, fail, skip, update } = results;

  if (UPDATE) {
    console.log(`\n[test-prompt-regression] Updated ${update} golden(s). ${skip} skipped.`);
    process.exit(fail > 0 ? 1 : 0);
  }

  console.log(`\n[test-prompt-regression] ${pass} passed, ${fail} failed, ${skip} skipped.`);

  if (skip > 0 && pass === 0 && fail === 0) {
    console.warn('[test-prompt-regression] All fixtures skipped — goldens not yet captured. Run with --update when bridge is live.');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[test-prompt-regression] Fatal: ${err.message}`);
  process.exit(1);
});
