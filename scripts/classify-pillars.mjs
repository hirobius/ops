#!/usr/bin/env node
/**
 * classify-pillars — deterministic keyword classifier for the
 * BUILD / GROW / RUN pillar field on orchestration units + kanban tasks.
 *
 * Pillar definitions (matches docs/knowledge/{build,grow,run}/ and the
 * existing classifier in scripts/parse-bookmarks.mjs):
 *
 *   BUILD  product / DS / site work — what Adrian makes
 *   GROW   sales / marketing / content / client acquisition
 *   RUN    ops / infra / hygiene / automation — what keeps it working
 *
 * Why deterministic and not LLM-driven:
 *   the original spec asked for "adaptive" / Ollama-backed classification,
 *   but every other gate in the repo is a pure deterministic check (see
 *   docs/guardrails/HARDENING_ROADMAP.md). A keyword classifier we can
 *   unit-test, fixture-prove, and run in pre-commit is far more useful as a
 *   guardrail than an Ollama call that may or may not be available. Adrian
 *   can always re-run with broader keywords; the script flags low-confidence
 *   matches for manual review rather than guessing.
 *
 * Modes:
 *   --dry-run   print plan only (default — never writes without --apply)
 *   --apply     write pillar field back to orchestration.json
 *   --json      machine-readable output (used by /ops UI)
 *   --include-done  also classify done units (default skips them)
 *
 * Exit codes:
 *   0  success (always — this is a classifier, not a gate)
 *
 * Invocation:
 *   node scripts/classify-pillars.mjs --dry-run --json
 *   node scripts/classify-pillars.mjs --apply
 *
 * @internal — not part of @hirobius/design-system public API surface.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── CLI ──────────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
// Dry-run is the default. Explicit --dry-run is fine. --apply turns it off.
const DRY_RUN = !APPLY;
const JSON_MODE = argv.has('--json');
const INCLUDE_DONE = argv.has('--include-done');

// ── Pillar keyword corpus ────────────────────────────────────────────────────
// Order matters: first pillar to score >= CONFIDENCE_THRESHOLD wins. Keywords
// are matched against id + name + description + cluster + agentNotes.
//
// Sources of truth for the corpus:
//   - scripts/parse-bookmarks.mjs PILLAR_MAP (the original Adrian taxonomy)
//   - docs/knowledge/{build,grow,run}/README.md (Adrian's own definitions)
//   - cluster-name conventions in docs/ai/orchestration.json

/** @typedef {'BUILD'|'GROW'|'RUN'} Pillar */

/** @type {Record<Pillar, string[]>} */
const KEYWORDS = {
  BUILD: [
    // Design system + product surfaces
    'design system', 'design-system', 'design tokens', 'tokens',
    'hds', 'component', 'primitive', 'storybook', 'specimen',
    'figma', 'figma-plugin', 'figma plugin', 'figjam',
    'ui', 'ux', 'visual', 'aesthetic', 'mobius', 'motion', '3d', 'three.js',
    'three-js', 'shader', 'illustration', 'animation',
    // Site / portfolio / pages
    'portfolio', 'site', 'page', 'route', 'page-clone', 'hero',
    'staging', 'sketch', 'a11y', 'accessibility', 'theme', 'themes',
    // Concrete creations product line
    'concrete', 'figurine', 'cad', 'print',
    // Client deliverables
    'client portal', 'client-portal', 'client report', 'client-report',
    'lilac', 'ranch', 'prospect',
    // Genui pipeline (the artifact, not the runner)
    'genui', 'gen-ui', 'shadcn', 'radix', 'cva',
  ],
  GROW: [
    // Marketing + content + audience
    'marketing', 'seo', 'content', 'social', 'audience', 'email',
    'newsletter', 'launch', 'announcement', 'inspo', 'inspiration',
    'branding', 'brand', 'audit-brand',
    // Sales
    'sales', 'pricing', 'quote', 'invoice', 'crm', 'lead', 'leads',
    'outreach', 'pitch', 'proposal',
    // Job-search / recruiter-facing — secondary growth path
    'recruiter', 'recruiter-facing', 'job hunt', 'job-hunt', 'leave-behind',
    'interview',
    // Client acquisition
    'client acquisition', 'client-acquisition', 'onboarding', 'intake',
    'discovery call', 'discovery-call',
    // Funding / business growth
    'funding', 'investor', 'shop', 'shops', 'store', 'stores',
    // Misc growth
    'youtube', 'linkedin', 'twitter',
  ],
  RUN: [
    // Operations + infra + tooling
    'ops', 'operation', 'infra', 'infrastructure', 'devops',
    'deploy', 'deployment', 'vercel', 'hetzner', 'vps', 'docker',
    'ci', 'ci/cd', 'gateway', 'daemon', 'watchdog', 'cron',
    // Automation + scripts
    'automation', 'auto-', 'classify', 'classifier', 'parser',
    'audit-', 'check-', 'validate-', 'guardrail', 'guardrails',
    'gate', 'gates', 'validator', 'validation',
    // Quality / hygiene / cleanup
    'cleanup', 'hygiene', 'burndown', 'burn-down', 'debt', 'tech-debt',
    'refactor', 'consolidat', 'lint', 'typecheck', 'test',
    // Knowledge / research / ingestion
    'knowledge', 'ingest', 'ingestion', 'parse-', 'bookmark',
    'research', 'analytics',
    // Agent / orchestration
    'orchestration', 'orchestrate', 'kanban', 'hermes-kanban',
    'agent-', 'sub-agent', 'subagent', 'dispatch', 'dispatcher',
    'auto-assigner', 'router', 'routing',
    // Manifest + schema (run-side housekeeping)
    'manifest', 'schema', 'registry', 'catalog',
    // AI plumbing
    'claude', 'ollama', 'hermes3', 'sonnet', 'haiku', 'opus', 'gemma',
    'llm', 'prompt', 'token-budget', 'cost-gate', 'cost gate',
  ],
};

// Confidence: we sort all matches by hit count and pick the winner if it
// beats runners-up by this margin. If two pillars tie, we flag for manual.
const CONFIDENCE_MARGIN = 1;

// ── Classifier core ──────────────────────────────────────────────────────────

/**
 * Score a single string against each pillar's keyword set. Returns a map of
 * { BUILD: n, GROW: n, RUN: n } where n is the count of unique keywords that
 * matched (case-insensitive substring).
 */
function score(text) {
  const lower = String(text || '').toLowerCase();
  /** @type {Record<Pillar, number>} */
  const out = { BUILD: 0, GROW: 0, RUN: 0 };
  for (const [pillar, kws] of Object.entries(KEYWORDS)) {
    let hits = 0;
    for (const kw of kws) {
      if (lower.includes(kw)) hits += 1;
    }
    out[/** @type {Pillar} */ (pillar)] = hits;
  }
  return out;
}

/**
 * Pick the winning pillar from a score map. Returns:
 *   { pillar, confidence, scores }
 * confidence ∈ { 'high' | 'low' | 'none' }.
 */
function pickPillar(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topName, topHits] = ranked[0];
  const [, secondHits] = ranked[1];

  if (topHits === 0) return { pillar: null, confidence: 'none', scores };
  const margin = topHits - secondHits;
  const confidence = margin >= CONFIDENCE_MARGIN ? 'high' : 'low';
  return { pillar: /** @type {Pillar} */ (topName), confidence, scores };
}

/**
 * Build the searchable text for a unit. Concatenates id, name, description,
 * cluster, agentNotes (if array, joined). Used by both orchestration units
 * and kanban tasks (which use { id, title, body }).
 */
function unitText(u) {
  const parts = [
    u.id,
    u.name,
    u.title,
    u.description,
    u.body,
    u.cluster,
    Array.isArray(u.agentNotes) ? u.agentNotes.join(' ') : u.agentNotes,
  ];
  return parts.filter(Boolean).join(' \n ');
}

/**
 * Public API: classify one unit-shaped object. Exported for testing.
 */
export function classifyUnit(u) {
  const text = unitText(u);
  const s = score(text);
  return pickPillar(s);
}

// ── Orchestration unit pass ──────────────────────────────────────────────────

function readOrchestration() {
  const p = join(ROOT, 'docs/ai/orchestration.json');
  return { path: p, data: JSON.parse(readFileSync(p, 'utf8')) };
}

function classifyOrchestration() {
  const { path: p, data } = readOrchestration();
  const units = Array.isArray(data.units) ? data.units : [];

  const targets = INCLUDE_DONE
    ? units
    : units.filter((u) => u.status !== 'done' && u.status !== 'denied');

  /** @type {{ id: string, current: string|null, picked: string|null, confidence: string, scores: Record<string,number> }[]} */
  const proposals = [];
  let highConf = 0;
  let lowConf = 0;
  let noMatch = 0;
  let alreadyClassified = 0;

  for (const u of targets) {
    const result = classifyUnit(u);
    const current = u.pillar ?? null;
    if (current && current === result.pillar) alreadyClassified += 1;
    if (result.confidence === 'high') highConf += 1;
    else if (result.confidence === 'low') lowConf += 1;
    else noMatch += 1;
    proposals.push({
      id: u.id,
      current,
      picked: result.pillar,
      confidence: result.confidence,
      scores: result.scores,
    });
  }

  // Apply: only overwrite when high-confidence AND no current pillar
  // (or current pillar disagrees — but flag for review). Conservative.
  let changes = 0;
  if (APPLY && !DRY_RUN) {
    for (const proposal of proposals) {
      if (proposal.confidence !== 'high' || !proposal.picked) continue;
      const u = units.find((x) => x.id === proposal.id);
      if (!u) continue;
      if (u.pillar === proposal.picked) continue;
      u.pillar = proposal.picked;
      changes += 1;
    }
    if (changes > 0) {
      writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
  }

  return {
    source: 'orchestration.json',
    path: p,
    totalScanned: targets.length,
    highConf,
    lowConf,
    noMatch,
    alreadyClassified,
    changes,
    proposals,
  };
}

// ── Distribution summary ─────────────────────────────────────────────────────

function distribution(proposals) {
  const out = { BUILD: 0, GROW: 0, RUN: 0, UNCLASSIFIED: 0 };
  for (const p of proposals) {
    if (p.picked && p.confidence === 'high') out[p.picked] += 1;
    else out.UNCLASSIFIED += 1;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const orchResult = classifyOrchestration();
  const dist = distribution(orchResult.proposals);

  const summary = {
    ok: true,
    mode: APPLY ? 'apply' : 'dry-run',
    distribution: dist,
    orchestration: {
      path: orchResult.path,
      totalScanned: orchResult.totalScanned,
      highConfidence: orchResult.highConf,
      lowConfidence: orchResult.lowConf,
      noMatch: orchResult.noMatch,
      alreadyClassified: orchResult.alreadyClassified,
      changesApplied: orchResult.changes,
    },
    flagged: orchResult.proposals
      .filter((p) => p.confidence === 'low' || p.confidence === 'none')
      .map((p) => ({ id: p.id, picked: p.picked, confidence: p.confidence, scores: p.scores })),
  };

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }

  console.log(`classify-pillars — ${summary.mode}`);
  console.log(`  scanned:    ${orchResult.totalScanned} unit(s) in ${orchResult.path}`);
  console.log(`  distribution: BUILD=${dist.BUILD} · GROW=${dist.GROW} · RUN=${dist.RUN} · UNCLASSIFIED=${dist.UNCLASSIFIED}`);
  console.log(`  confidence: high=${orchResult.highConf} · low=${orchResult.lowConf} · no-match=${orchResult.noMatch}`);
  if (APPLY) {
    console.log(`  applied:    ${orchResult.changes} change(s) written to ${orchResult.path}`);
  } else {
    console.log(`  (dry-run — re-run with --apply to write pillar field back)`);
  }
  if (summary.flagged.length > 0) {
    console.log('');
    console.log(`flagged for manual review (${summary.flagged.length}):`);
    for (const f of summary.flagged.slice(0, 25)) {
      const top = Object.entries(f.scores).sort((a, b) => b[1] - a[1])[0];
      console.log(`  · ${f.id}  [${f.confidence}]  best=${f.picked ?? '—'}  top-score=${top[0]}:${top[1]}`);
    }
    if (summary.flagged.length > 25) {
      console.log(`  · ... and ${summary.flagged.length - 25} more`);
    }
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
