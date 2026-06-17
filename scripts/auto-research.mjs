#!/usr/bin/env node
/**
 * scripts/auto-research.mjs
 *
 * Auto-research runner — reads docs/research/queries.json and runs each
 * query against a local Ollama model, persisting findings to
 * docs/research/findings/<query-id>/<timestamp>.md.
 *
 * Companion to the user-triggered research input shell. This is the
 * scheduled side: same dispatch path, different trigger.
 *
 * Per the kanban task t_b28fc089:
 *   - manifest:    docs/research/queries.json (committed; sample queries)
 *   - runner:      this script (committed)
 *   - surface:     /ops/agentic-os "Research" disclosure (committed)
 *   - scheduling:  DEFERRED — VPS not yet provisioned. Trigger manually
 *                  via the ops surface or `node scripts/auto-research.mjs --once`
 *                  until cron infra exists. Documented in
 *                  docs/research/queries.json and CLAUDE.md.
 *
 * Usage:
 *   node scripts/auto-research.mjs --dry-run --json   # validate config; no Ollama call
 *   node scripts/auto-research.mjs --once             # run every enabled query, write findings
 *   node scripts/auto-research.mjs --once --query <id># run a single query
 *   node scripts/auto-research.mjs --list             # list queries + last-run timestamps
 *
 * Output files:
 *   docs/research/findings/<id>/<ISO-timestamp>.md
 *
 * The findings dir is gitignored (see .gitignore) — local knowledge.
 *
 * @module auto-research
 */

import { promises as fsp, existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUERIES_PATH = path.join(ROOT, 'docs/research/queries.json');
const FINDINGS_DIR = path.join(ROOT, 'docs/research/findings');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes('--dry-run'),
  once: args.includes('--once'),
  list: args.includes('--list'),
  json: args.includes('--json'),
  query:
    args[args.indexOf('--query') + 1] && !args[args.indexOf('--query') + 1].startsWith('--')
      ? args[args.indexOf('--query') + 1]
      : null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** @typedef {{ id: string; topic: string; prompt: string; schedule: string; source: string; model: string; enabled: boolean }} Query */

/** @returns {{ queries: Query[] }} */
function loadQueries() {
  if (!existsSync(QUERIES_PATH)) {
    throw new Error(`queries config missing: ${QUERIES_PATH}`);
  }
  const raw = readFileSync(QUERIES_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.queries)) {
    throw new Error(`queries config malformed: expected { queries: [] }`);
  }
  for (const q of parsed.queries) {
    if (!q.id || !q.prompt || !q.model) {
      throw new Error(`query missing required fields (id, prompt, model): ${JSON.stringify(q)}`);
    }
  }
  return parsed;
}

/**
 * @param {string} id
 * @returns {{ count: number; latest: string | null }}
 */
function findingsStats(id) {
  const dir = path.join(FINDINGS_DIR, id);
  if (!existsSync(dir)) return { count: 0, latest: null };
  let list = [];
  try {
    list = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort();
  } catch {
    // Directory unreadable — treat as no findings.
    return { count: 0, latest: null };
  }
  return {
    count: list.length,
    latest: list.length > 0 ? list[list.length - 1] : null,
  };
}

/**
 * Call Ollama /api/generate with a single prompt. Local, free, no API keys.
 * @param {string} model
 * @param {string} prompt
 * @returns {Promise<{ response: string; durationMs: number }>}
 */
async function callOllama(model, prompt) {
  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  return {
    response: body.response ?? '',
    durationMs: Date.now() - start,
  };
}

/**
 * Persist one finding as a markdown file with frontmatter.
 * @param {Query} query
 * @param {string} body
 * @param {{ ts: string; durationMs: number; modelUsed: string }} meta
 * @returns {Promise<string>} relative path written
 */
async function writeFinding(query, body, meta) {
  const dir = path.join(FINDINGS_DIR, query.id);
  await fsp.mkdir(dir, { recursive: true });
  const safeTs = meta.ts.replace(/:/g, '-'); // filesystem-safe
  const file = path.join(dir, `${safeTs}.md`);
  const md = [
    '---',
    `id: ${query.id}`,
    `topic: ${query.topic}`,
    `ts: ${meta.ts}`,
    `model: ${meta.modelUsed}`,
    `duration_ms: ${meta.durationMs}`,
    `source: ${query.source}`,
    '---',
    '',
    `# ${query.topic}`,
    '',
    `*Run: ${meta.ts} · model: ${meta.modelUsed} · ${meta.durationMs}ms*`,
    '',
    body.trim(),
    '',
  ].join('\n');
  await fsp.writeFile(file, md, 'utf8');
  return path.relative(ROOT, file);
}

// ── Entry points ─────────────────────────────────────────────────────────────

async function listQueries(config) {
  const items = config.queries.map((q) => {
    const stats = findingsStats(q.id);
    return {
      id: q.id,
      topic: q.topic,
      schedule: q.schedule,
      source: q.source,
      model: q.model,
      enabled: q.enabled,
      findings: stats.count,
      latest: stats.latest,
    };
  });
  return items;
}

async function runOnce(config, { single = null } = {}) {
  const targets = config.queries.filter((q) => q.enabled && (single === null || q.id === single));
  if (targets.length === 0) {
    return { ran: 0, findings: [], skipped: config.queries.length };
  }
  /** @type {{ id: string; file: string; durationMs: number; ok: boolean; error?: string }[]} */
  const findings = [];
  for (const query of targets) {
    const ts = new Date().toISOString();
    try {
      const { response, durationMs } = await callOllama(query.model, query.prompt);
      const file = await writeFinding(query, response, { ts, durationMs, modelUsed: query.model });
      findings.push({ id: query.id, file, durationMs, ok: true });
    } catch (err) {
      findings.push({
        id: query.id,
        file: '',
        durationMs: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ran: targets.length, findings, skipped: config.queries.length - targets.length };
}

async function dryRun(config) {
  // Validate config + report what would run, without calling Ollama.
  const items = config.queries.map((q) => ({
    id: q.id,
    topic: q.topic,
    enabled: q.enabled,
    model: q.model,
    schedule: q.schedule,
    promptLength: q.prompt.length,
  }));
  return {
    ok: true,
    queriesPath: path.relative(ROOT, QUERIES_PATH),
    findingsDir: path.relative(ROOT, FINDINGS_DIR),
    ollamaUrl: OLLAMA_URL,
    queries: items,
    enabledCount: items.filter((i) => i.enabled).length,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let config;
  try {
    config = loadQueries();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (flags.json) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    } else {
      console.error(`auto-research: ${msg}`);
    }
    process.exit(2);
  }

  // Make sure findings root exists so list/dry-run don't fail on first run.
  if (!existsSync(FINDINGS_DIR)) {
    mkdirSync(FINDINGS_DIR, { recursive: true });
  }

  if (flags.list) {
    const items = await listQueries(config);
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, items }, null, 2));
    } else {
      for (const item of items) {
        const enabled = item.enabled ? '●' : '○';
        const latest = item.latest ?? '(no findings)';
        console.log(
          `${enabled} ${item.id}  ${item.schedule.padEnd(8)} ${item.findings} findings · ${latest}`,
        );
      }
    }
    return;
  }

  if (flags.dryRun) {
    const result = await dryRun(config);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`auto-research: ${result.enabledCount}/${result.queries.length} enabled`);
      for (const q of result.queries) {
        console.log(`  ${q.enabled ? '●' : '○'} ${q.id}  → ${q.model}  (${q.promptLength} chars)`);
      }
    }
    return;
  }

  if (flags.once) {
    const result = await runOnce(config, { single: flags.query });
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } else {
      console.log(`auto-research: ran ${result.ran}, skipped ${result.skipped}`);
      for (const f of result.findings) {
        if (f.ok) {
          console.log(`  ✓ ${f.id} → ${f.file}  (${f.durationMs}ms)`);
        } else {
          console.log(`  ✗ ${f.id} failed: ${f.error}`);
        }
      }
    }
    // Exit non-zero if every run failed and any were attempted — gate-friendly.
    if (result.ran > 0 && result.findings.every((f) => !f.ok)) process.exit(1);
    return;
  }

  // Default: print usage + JSON-friendly status (so wrapping it as a skill
  // returns something useful with no flags).
  const summary = await dryRun(config);
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } else {
    console.log('auto-research — usage:');
    console.log('  --dry-run [--json]    validate config; no Ollama call');
    console.log('  --once [--query <id>] run every enabled query (or one)');
    console.log('  --list [--json]       show queries + finding counts');
    console.log('');
    console.log(`config: ${summary.queriesPath}`);
    console.log(`enabled: ${summary.enabledCount}/${summary.queries.length}`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  if (flags.json) {
    console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  } else {
    console.error(`auto-research: ${msg}`);
  }
  process.exit(1);
});
