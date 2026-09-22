#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Runs docs/secrets/registry.json's `probe` against the live service for
 * every registered secret (ops#415) and reports which ones are missing,
 * invalid, or close to expiry — so a fleet secret can't lapse silently.
 *
 * Reads secrets from `process.env` ONLY. Never opens or reads a `.env*`
 * file — CI is what injects real values here; a local run without them
 * simply reports every secret as "not set", which is correct, not broken.
 *
 * Per registry entry: dispatches to the probe named by its `probe` field
 * (scripts/lib/secret-probes.mjs) using `process.env[entry.name]`. A
 * `"verified"` probeStrength entry authenticates against the live service;
 * a `"presence-only"` entry can only confirm the env var is set — this
 * script never lets a presence-only pass print as verified (it prints the
 * probe's own `verified` flag, not the registry's static claim).
 *
 * Every failure or expiry warning names: the secret, its `repo`, what
 * breaks (`breaksWhenMissing`), and where to fix it (`rotateUrl`) — per
 * CLAUDE.md's "token/secret-backed features must fail loud and actionable."
 *
 * Usage:
 *   node scripts/check-secret-health.mjs             # human output
 *   node scripts/check-secret-health.mjs --json       # canonical { violations } shape
 *   node scripts/check-secret-health.mjs --repo hirobius/ops   # only that repo's entries
 *
 * Exit codes: 0 all healthy (or a warn-only finding) · 1 a registered secret
 * is missing or the live service rejected it, or any secret is within
 * WARN_DAYS of a known expiry · 2 invocation error (registry.json missing/bad).
 *
 * @module check-secret-health
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { PROBES, WARN_DAYS } from './lib/secret-probes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = join(ROOT, 'docs/secrets/registry.json');

function loadRegistry(registryPath = REGISTRY_PATH) {
  const raw = readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.secrets)) throw new Error('registry.json: "secrets" is not an array');
  return parsed.secrets;
}

/**
 * Check one registry entry. Pure aside from the probe call itself, which
 * takes `fetchImpl` — tests inject a fake so nothing here touches the real
 * network.
 *
 * @param {object} entry a docs/secrets/registry.json entry
 * @param {Record<string,string|undefined>} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<object>} a Violation-shaped result, always present (even
 *   for a healthy secret) so the caller can build a full report, not just a
 *   violations list — the caller decides which severities are worth printing.
 */
export async function checkEntry(entry, env = process.env, fetchImpl = fetch) {
  const probeFn = PROBES[entry.probe];
  if (!probeFn) {
    return {
      file: '*',
      line: null,
      rule: 'unknown-probe',
      severity: 'error',
      message: `${entry.repo}/${entry.name}: registry declares probe "${entry.probe}", which check-secret-health.mjs does not implement.`,
      repo: entry.repo,
      name: entry.name,
    };
  }

  const value = env[entry.name];
  const result = await probeFn({
    name: entry.name,
    value,
    env,
    fetchImpl,
    expiresAt: entry.expiresAt,
  });

  // The one rule this script must never break: report what the probe itself
  // established (`result.verified`), never the registry's static claim — a
  // presence-only result must never print as verified.
  const strengthLabel = result.verified === true ? 'verified' : 'presence-only';

  if (!result.ok) {
    return {
      file: '*',
      line: null,
      rule: 'secret-unhealthy',
      severity: 'error',
      message:
        `${entry.repo}: ${entry.name} is unhealthy (${strengthLabel}) — ${result.message}. ` +
        `Breaks: ${entry.breaksWhenMissing} Fix: ${entry.rotateUrl}`,
      repo: entry.repo,
      name: entry.name,
      probeStrength: strengthLabel,
    };
  }

  if (typeof result.daysRemaining === 'number' && result.daysRemaining < WARN_DAYS) {
    return {
      file: '*',
      line: null,
      rule: 'secret-expiring-soon',
      severity: 'warn',
      message:
        `${entry.repo}: ${entry.name} expires in ${result.daysRemaining} day(s) (${strengthLabel}) — ${result.message}. ` +
        `Breaks when it lapses: ${entry.breaksWhenMissing} Rotate: ${entry.rotateUrl}`,
      repo: entry.repo,
      name: entry.name,
      probeStrength: strengthLabel,
      daysRemaining: result.daysRemaining,
    };
  }

  return {
    file: '*',
    line: null,
    rule: 'secret-healthy',
    severity: 'info',
    message: `${entry.repo}: ${entry.name} is healthy (${strengthLabel}) — ${result.message}`,
    repo: entry.repo,
    name: entry.name,
    probeStrength: strengthLabel,
    daysRemaining: result.daysRemaining,
  };
}

/**
 * Run every registry entry's probe. Pure aside from the probes themselves.
 *
 * @param {object[]} registryEntries
 * @param {Record<string,string|undefined>} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{results: object[], violations: object[], summary: object}>}
 */
export async function runHealthCheck(registryEntries, env = process.env, fetchImpl = fetch) {
  const results = await Promise.all(
    registryEntries.map((entry) => checkEntry(entry, env, fetchImpl)),
  );
  const violations = results.filter((r) => r.severity === 'error' || r.severity === 'warn');
  const summary = {
    total: results.length,
    healthy: results.filter((r) => r.rule === 'secret-healthy').length,
    expiringSoon: results.filter((r) => r.rule === 'secret-expiring-soon').length,
    unhealthy: results.filter((r) => r.rule === 'secret-unhealthy').length,
    verified: results.filter((r) => r.probeStrength === 'verified').length,
    presenceOnly: results.filter((r) => r.probeStrength === 'presence-only').length,
  };
  return { results, violations, summary };
}

async function main(argv = process.argv) {
  const jsonMode = hasJsonFlag(argv);
  const repoIdx = argv.indexOf('--repo');
  const repoFilter = repoIdx !== -1 ? argv[repoIdx + 1] : null;

  let registryEntries;
  try {
    registryEntries = loadRegistry();
  } catch (err) {
    console.error(`check-secret-health: could not read docs/secrets/registry.json: ${err.message}`);
    return 2;
  }

  if (repoFilter) registryEntries = registryEntries.filter((e) => e.repo === repoFilter);

  const { results, violations, summary } = await runHealthCheck(
    registryEntries,
    process.env,
    fetch,
  );

  if (jsonMode) {
    const errorViolations = violations.filter((v) => v.severity === 'error');
    emitResult({ violations, summary, ok: errorViolations.length === 0 }, true);
    return errorViolations.length > 0 ? 1 : 0;
  }

  for (const r of results) {
    const icon = r.severity === 'error' ? '✗' : r.severity === 'warn' ? '⚠' : '✓';
    console.log(`${icon} ${r.message}`);
  }
  console.log('');
  console.log(
    `${summary.healthy}/${summary.total} healthy, ${summary.expiringSoon} expiring soon, ${summary.unhealthy} unhealthy ` +
      `(${summary.verified} verified against a live service, ${summary.presenceOnly} presence-only).`,
  );

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  return errorCount > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`check-secret-health: ${err.message}`);
      process.exit(2);
    });
}

export { main, loadRegistry };
