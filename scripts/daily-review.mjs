#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/daily-review.mjs
 *
 * Agentic-ops review loop — Slice 1 (issue #29). A read-only review pass:
 * runs the existing registered guardrail gates, records what fired as
 * "findings," and prints/writes a digest. No auto-dispatch, no LLM/API key,
 * no writes to source. A human (or a later slice) decides what to do with
 * the findings — this script only observes and reports.
 *
 * Reuses the existing gate infrastructure rather than reinventing it:
 *   - docs/guardrails/registry.json is the single source of truth for which
 *     gates exist, their severity, and their firingChannel.
 *   - scripts/run-gates.mjs --channel <ch> --emit-inventory <tmp> already
 *     runs every gate on a channel without fail-fast and captures per-gate
 *     {exitCode, durationMs, violations, outputTail} — this script shells
 *     out to it (one child process per channel) and reads the inventory
 *     back rather than re-implementing gate dispatch.
 *
 * Default channels: manual, pnpm-meta (the ops-relevant, non-pre-commit
 * gate set). Override with --channel <a,b,...>.
 *
 * Outputs:
 *   findings.jsonl                — repo-root, append-mode, gitignored.
 *                                   One JSON line per finding:
 *                                   { ts, channel, gate, severity, exitCode, summary }
 *                                   A "finding" = a gate that exited non-zero
 *                                   OR reported at least one structured
 *                                   violation (supportsJson gates). Clean
 *                                   gates are not logged — findings.jsonl is
 *                                   a log of things to look at, not a full
 *                                   run history (see docs/guardrails/registry.json
 *                                   + firing-log.jsonl for that).
 *   daily-review-digest.json      — repo-root, overwritten each run, gitignored.
 *                                   Snapshot of the most recent run: which
 *                                   channels ran, how many gates, and the
 *                                   finding list. `/ops` doesn't render this
 *                                   yet — src/app/digests/*.json is a
 *                                   differently-shaped surface (newsletter
 *                                   intel, see src/app/pages/ops/digest/DigestPage.tsx)
 *                                   and force-fitting this into that shape
 *                                   would be overbuilding Slice 1. Wiring a
 *                                   review-findings surface into /ops is a
 *                                   follow-up (Slice 2 board, per the design doc).
 *
 * Flags:
 *   --json              Emit ONLY the digest JSON to stdout; human summary
 *                        goes to stderr instead. (Matches the --json
 *                        contract convention in scripts/lib/gate-output.mjs.)
 *   --channel <a,b,...> Comma-separated firingChannel list to run.
 *                        Default: manual,pnpm-meta
 *   --help               Print usage and exit 0.
 *
 * Exit codes:
 *   0 — the review ran to completion (regardless of whether findings exist —
 *       this is an observer, not a gate; it never blocks anything).
 *   2 — invocation error (bad flags, registry missing, run-gates.mjs missing).
 *
 * Purity: no network calls of its own (the gates it invokes may make their
 * own, e.g. audit-deps); no writes to src/**; the only writes are
 * findings.jsonl (append) and daily-review-digest.json (overwrite), both
 * gitignored. `ts` fields use the wall clock at invocation — one timestamp
 * per run, applied to every finding from that run — which is the documented
 * "timestamp in output is fine" exception, not a source of nondeterminism
 * in the gates themselves.
 *
 * Run:  node scripts/daily-review.mjs
 * Via:  pnpm review:daily
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRegistry, REGISTRY_PATH } from './lib/guardrail-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_GATES = path.join(ROOT, 'scripts/run-gates.mjs');
const FINDINGS_PATH = path.join(ROOT, 'findings.jsonl');
const DIGEST_PATH = path.join(ROOT, 'daily-review-digest.json');

const DEFAULT_CHANNELS = ['manual', 'pnpm-meta'];

// ── Arg parsing ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes('--json');
const HELP = argv.includes('--help') || argv.includes('-h');

function getFlag(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

const channelArg = getFlag('--channel');
const channels = channelArg
  ? channelArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_CHANNELS;

if (HELP) {
  process.stdout.write(`daily-review.mjs — agentic-ops review loop, Slice 1 (read-only)

Runs registered guardrail gates (docs/guardrails/registry.json) for one or
more channels, records what fired to findings.jsonl, and prints a digest.
No auto-dispatch, no LLM/API key required, no writes to source.

Usage:
  node scripts/daily-review.mjs [--channel a,b,...] [--json] [--help]

Options:
  --channel <a,b,...>  Comma-separated firingChannel list. Default: ${DEFAULT_CHANNELS.join(',')}
  --json               Emit only the digest JSON to stdout (human summary to stderr).
  --help               Show this message.

Outputs:
  findings.jsonl              repo-root, append-mode (gitignored)
  daily-review-digest.json    repo-root, overwritten each run (gitignored)
`);
  process.exit(0);
}

// ── Load registry (for per-gate severity lookup — inventory doesn't carry it) ──

const loaded = loadRegistry(REGISTRY_PATH);
if (!loaded.ok) {
  process.stderr.write(
    loaded.error.kind === 'not-found'
      ? `✗ daily-review: registry not found at ${REGISTRY_PATH}\n`
      : `✗ daily-review: could not parse registry: ${loaded.error.message}\n`,
  );
  process.exit(2);
}
const gateById = new Map((loaded.registry.gates ?? []).map((g) => [g.id, g]));

if (!fs.existsSync(RUN_GATES)) {
  process.stderr.write(`✗ daily-review: scripts/run-gates.mjs not found — cannot run gates\n`);
  process.exit(2);
}

// ── Run each channel via run-gates.mjs --emit-inventory, read the result ───

const RUN_TS = new Date().toISOString();
const log = (msg) => {
  if (!JSON_MODE) process.stdout.write(msg + '\n');
  else process.stderr.write(msg + '\n');
};

/**
 * @typedef {Object} ChannelRun
 * @property {string} channel
 * @property {boolean} ok            false only on a genuine invocation error
 * @property {string|null} error
 * @property {Array<object>} gates   inventory records (possibly empty)
 */

/** @type {ChannelRun[]} */
const channelRuns = [];

for (const channel of channels) {
  log(`── running channel '${channel}' ──`);
  const inventoryPath = path.join(
    os.tmpdir(),
    `daily-review-inventory-${channel}-${process.pid}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [RUN_GATES, '--channel', channel, '--emit-inventory', inventoryPath],
    { cwd: ROOT, encoding: 'utf8' },
  );

  if (!JSON_MODE && result.stdout) process.stdout.write(result.stdout);
  if (!JSON_MODE && result.stderr) process.stderr.write(result.stderr);

  // run-gates.mjs exits 2 for invocation errors (bad channel, registry
  // missing, etc.) — that's a real problem for daily-review too. A gate
  // *failing* is not an invocation error (--emit-inventory forces exit 0
  // in that case) — only exit 2 is.
  if (result.status === 2) {
    channelRuns.push({
      channel,
      ok: false,
      error: `run-gates.mjs exited 2 (invocation error) for channel '${channel}'`,
      gates: [],
    });
    continue;
  }

  let inventory = null;
  if (fs.existsSync(inventoryPath)) {
    try {
      inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    } catch (e) {
      channelRuns.push({
        channel,
        ok: false,
        error: `failed to parse inventory for channel '${channel}': ${e.message}`,
        gates: [],
      });
      continue;
    } finally {
      fs.rmSync(inventoryPath, { force: true });
    }
  }
  // No inventory file means zero gates matched the channel (run-gates.mjs
  // exits before writing the inventory in that case) — not an error.

  channelRuns.push({
    channel,
    ok: true,
    error: null,
    gates: inventory?.gates ?? [],
  });
}

// ── Build findings ───────────────────────────────────────────────────────
//
// A "finding" is a gate that either exited non-zero, or (for supportsJson
// gates) reported at least one structured violation even while exiting 0
// (some audits are informational-only and never fail the exit code).

function truncate(s, n) {
  if (!s) return '';
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function summarize(gateRecord) {
  const { violations, outputTail, exitCode } = gateRecord;
  if (Array.isArray(violations) && violations.length > 0) {
    const first = violations[0];
    const firstMsg = first?.message || first?.rule || null;
    return firstMsg
      ? `${violations.length} violation(s) — e.g. "${truncate(firstMsg, 120)}"`
      : `${violations.length} violation(s)`;
  }
  // outputTail is the last 50 lines of combined stdout+stderr, so its first
  // line can land mid-stack-trace for a crashed gate (e.g. "node:fs:440").
  // Prefer an actual "Error: ..." line when one is present; otherwise fall
  // back to the first non-empty line.
  const nonEmptyLines = (outputTail ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errorLine = nonEmptyLines.find((l) => /error:/i.test(l));
  if (errorLine) return truncate(errorLine, 160);
  if (nonEmptyLines[0]) return truncate(nonEmptyLines[0], 160);
  return `exited with code ${exitCode}`;
}

const findings = [];

for (const run of channelRuns) {
  if (!run.ok) {
    findings.push({
      ts: RUN_TS,
      channel: run.channel,
      gate: null,
      severity: 'error',
      exitCode: null,
      summary: run.error,
    });
    continue;
  }
  for (const gateRecord of run.gates) {
    const hasViolations = Array.isArray(gateRecord.violations) && gateRecord.violations.length > 0;
    const isFinding = gateRecord.exitCode !== 0 || hasViolations;
    if (!isFinding) continue;
    const registryGate = gateById.get(gateRecord.id);
    findings.push({
      ts: RUN_TS,
      channel: run.channel,
      gate: gateRecord.id,
      severity: registryGate?.severity ?? 'warn',
      exitCode: gateRecord.exitCode,
      summary: summarize(gateRecord),
    });
  }
}

// ── Write findings.jsonl (append) ───────────────────────────────────────────

if (findings.length > 0) {
  const lines = findings.map((f) => JSON.stringify(f)).join('\n') + '\n';
  fs.appendFileSync(FINDINGS_PATH, lines);
}

// ── Write digest (overwrite) ────────────────────────────────────────────────

const gatesRun = channelRuns.reduce((n, r) => n + r.gates.length, 0);
const digest = {
  generatedAt: RUN_TS,
  channels,
  gatesRun,
  findingsCount: findings.length,
  channelErrors: channelRuns
    .filter((r) => !r.ok)
    .map((r) => ({ channel: r.channel, error: r.error })),
  findings,
};

fs.writeFileSync(DIGEST_PATH, JSON.stringify(digest, null, 2) + '\n');

// ── Emit ─────────────────────────────────────────────────────────────────

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(digest, null, 2) + '\n');
} else {
  process.stdout.write(`\n── daily-review digest (${RUN_TS}) ──\n`);
  process.stdout.write(`channels: ${channels.join(', ')}\n`);
  process.stdout.write(`gates run: ${gatesRun}\n`);
  if (findings.length === 0) {
    process.stdout.write(`findings: none — all clean\n`);
  } else {
    process.stdout.write(`findings: ${findings.length}\n`);
    for (const f of findings) {
      const gateLabel = f.gate ?? '(channel-level error)';
      process.stdout.write(
        `  [${f.severity}] ${f.channel}/${gateLabel} (exit ${f.exitCode}) — ${f.summary}\n`,
      );
    }
  }
  process.stdout.write(
    `\nwrote: ${path.relative(ROOT, FINDINGS_PATH)} (appended), ${path.relative(ROOT, DIGEST_PATH)} (overwritten)\n`,
  );
}

process.exit(0);
