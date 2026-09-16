#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-production-health.mjs — asserts /ops's live data path, not
 * just a 200 (ops#347, script half of #318).
 *
 * On 2026-09-14 the `/ops` Tasks board was dead and the only detection was
 * Adrian glancing at his phone. The Supabase project had paused (free-tier
 * 7-day idle pause) and `GET /api/tasks` returned `{ tasks: [] }` — a clean
 * 200, page renders fine, board just silently shows zero everything. This
 * script hits the real data path and asserts row count, not HTTP status, so
 * that failure mode is detected instead of looking healthy.
 *
 * Two checks:
 *   1. `GET {OPS_BASE_URL}/api/tasks` as a headless agent (OPS_AGENT_KEY,
 *      lib/ops-auth.mjs) — fails unless the response is `{ tasks: [...] }`
 *      with at least one row.
 *   2. Where SUPABASE_ACCESS_TOKEN is set, reads the Supabase project's
 *      status directly via the Management API and distinguishes
 *      INACTIVE / COMING_UP / RESTORING / healthy — each with its own
 *      message. Skipped (not failed) when the token isn't configured, since
 *      check 1 already covers the data path.
 *
 * On any failure, notifies through the existing `lib/ops/notify.mjs` seam
 * (DISCORD_WEBHOOK_URL) — no new alert path.
 *
 * Usage:
 *   node scripts/check-production-health.mjs           # human output
 *   node scripts/check-production-health.mjs --json     # canonical { violations } shape
 *
 * Env:
 *   OPS_BASE_URL           required — origin of the deployed app, e.g.
 *                          https://hirobius-ops.vercel.app
 *   OPS_AGENT_KEY           required — machine-auth bearer token for headless
 *                          agents (lib/ops-auth.mjs); Adrian sets it in Vercel.
 *   SUPABASE_ACCESS_TOKEN   optional — enables the direct project-status check.
 *   SUPABASE_PROJECT_REF    optional — defaults to the ops project (vvyccwxtcwvlusweenje).
 *
 * Exit codes: 0 healthy · 1 unhealthy (or --json config error) · 2 invocation
 * error (missing required env, non-json mode).
 *
 * @module check-production-health
 */

import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult, exitCodeFor } from './lib/gate-output.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const SUPABASE_TOKENS_URL = 'https://supabase.com/dashboard/account/tokens';
export const DEFAULT_PROJECT_REF = 'vvyccwxtcwvlusweenje';

export const OPS_BASE_URL_FIX =
  "OPS_BASE_URL is not set — set it to the deployed app's origin " +
  '(e.g. https://hirobius-ops.vercel.app) so this script knows what to check: ' +
  `${VERCEL_ENV_URL}`;

export const OPS_AGENT_KEY_FIX =
  'OPS_AGENT_KEY is not set — this script authenticates to /api/tasks as a headless ' +
  `agent (lib/ops-auth.mjs). Set it in Vercel → Settings → Environment Variables: ${VERCEL_ENV_URL}`;

function resumeUrl(projectRef) {
  return `https://supabase.com/dashboard/project/${projectRef}`;
}

function violation(rule, message) {
  return { file: '*', line: null, rule, severity: 'error', message };
}

/** Required env vars, checked before any network call. */
export function missingEnvViolations(env = process.env) {
  const out = [];
  if (!env.OPS_BASE_URL) out.push(violation('missing-env-ops-base-url', OPS_BASE_URL_FIX));
  if (!env.OPS_AGENT_KEY) out.push(violation('missing-env-ops-agent-key', OPS_AGENT_KEY_FIX));
  return out;
}

/**
 * Hits `GET {baseUrl}/api/tasks` as a headless agent and asserts a live data
 * path. A paused/unreachable Supabase project shows up here as a clean 200
 * with `{ tasks: [] }` — that is the specific shape this must catch, not
 * merely a non-200.
 *
 * @param {{ baseUrl: string, agentKey: string, projectRef: string, fetchImpl?: typeof fetch }} opts
 */
export async function checkTasksEndpoint({ baseUrl, agentKey, projectRef, fetchImpl = fetch }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/tasks`;

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${agentKey}` },
      signal: AbortSignal.timeout(9000),
    });
  } catch (e) {
    return {
      ok: false,
      state: 'unreachable',
      message: `GET ${url} failed: ${e.message} — the deployment may be down, or OPS_BASE_URL may be wrong.`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      state: 'http_error',
      message: `GET ${url} returned HTTP ${res.status} — check the deployment: https://vercel.com/adrian-6234s-projects/hirobius-ops`,
    };
  }

  let body;
  try {
    body = await res.json();
  } catch (e) {
    return {
      ok: false,
      state: 'invalid_response',
      message: `GET ${url} returned 200 but the body did not parse as JSON: ${e.message}`,
    };
  }

  if (!body || !Array.isArray(body.tasks)) {
    return {
      ok: false,
      state: 'invalid_response',
      message: `GET ${url} returned 200 but the body was not the expected { tasks: [...] } shape.`,
    };
  }

  if (body.tasks.length === 0) {
    return {
      ok: false,
      state: 'empty',
      message:
        `GET ${url} returned { tasks: [] } — this is exactly what a paused Supabase ` +
        `project looks like (board shows open (0)/blocked (0)/done (0) while GitHub-backed ` +
        `panels keep working). Check the project status: ${resumeUrl(projectRef)}`,
    };
  }

  return {
    ok: true,
    state: 'healthy',
    message: `GET ${url} returned ${body.tasks.length} task(s).`,
  };
}

/**
 * Reads the Supabase project's status directly via the Management API and
 * distinguishes INACTIVE / COMING_UP / RESTORING / healthy. Skipped (ok:
 * true, not a violation) when SUPABASE_ACCESS_TOKEN isn't set — `checkTasksEndpoint`
 * already covers the data path; this is the richer "why" when reachable.
 *
 * @param {{ projectRef: string, accessToken?: string, fetchImpl?: typeof fetch }} opts
 */
export async function checkSupabaseProjectStatus({ projectRef, accessToken, fetchImpl = fetch }) {
  if (!accessToken) {
    return {
      ok: true,
      state: 'skipped',
      message:
        'SUPABASE_ACCESS_TOKEN not set — skipping the direct project-status check ' +
        `(INACTIVE/COMING_UP/RESTORING detail). Create one at ${SUPABASE_TOKENS_URL} and set it ` +
        `in Vercel to enable it: ${VERCEL_ENV_URL}`,
    };
  }

  const url = `https://api.supabase.com/v1/projects/${projectRef}`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(9000),
    });
  } catch (e) {
    return { ok: false, state: 'unreachable', message: `GET ${url} failed: ${e.message}` };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      state: 'unauthorized',
      message:
        `Supabase Management API rejected SUPABASE_ACCESS_TOKEN (HTTP ${res.status}) — it may be ` +
        `expired/revoked. Rotate it at ${SUPABASE_TOKENS_URL} and update it in Vercel: ${VERCEL_ENV_URL}`,
    };
  }

  if (!res.ok) {
    return { ok: false, state: 'http_error', message: `GET ${url} returned HTTP ${res.status}` };
  }

  let body;
  try {
    body = await res.json();
  } catch (e) {
    return {
      ok: false,
      state: 'invalid_response',
      message: `GET ${url} returned 200 but the body did not parse as JSON: ${e.message}`,
    };
  }

  const status = body?.status;
  switch (status) {
    case 'ACTIVE_HEALTHY':
      return {
        ok: true,
        state: 'healthy',
        message: `Supabase project ${projectRef} is ACTIVE_HEALTHY.`,
      };
    case 'INACTIVE':
      return {
        ok: false,
        state: 'inactive',
        message:
          `Supabase project ${projectRef} is INACTIVE (free-tier 7-day idle pause). ` +
          `Resume: ${resumeUrl(projectRef)}`,
      };
    case 'COMING_UP':
      return {
        ok: false,
        state: 'coming_up',
        message:
          `Supabase project ${projectRef} is COMING_UP (resuming from pause) — wait a minute ` +
          `or two and re-check: ${resumeUrl(projectRef)}`,
      };
    case 'RESTORING':
      return {
        ok: false,
        state: 'restoring',
        message:
          `Supabase project ${projectRef} is RESTORING (restoring from a backup/pause) — wait ` +
          `and re-check: ${resumeUrl(projectRef)}`,
      };
    default:
      return {
        ok: false,
        state: 'degraded',
        message: `Supabase project ${projectRef} reports status "${status ?? 'unknown'}" — check ${resumeUrl(projectRef)}`,
      };
  }
}

/**
 * Runs both checks and notifies on failure. Assumes `env.OPS_BASE_URL` and
 * `env.OPS_AGENT_KEY` are already present — call {@link missingEnvViolations}
 * first (the CLI driver does).
 *
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, notify?: typeof notifyEvent, now?: () => string }} [opts]
 */
export async function runHealthCheck({
  env = process.env,
  fetchImpl = fetch,
  notify = notifyEvent,
  now = () => new Date().toISOString(),
} = {}) {
  const projectRef = env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;

  const tasksResult = await checkTasksEndpoint({
    baseUrl: env.OPS_BASE_URL,
    agentKey: env.OPS_AGENT_KEY,
    projectRef,
    fetchImpl,
  });
  const supabaseResult = await checkSupabaseProjectStatus({
    projectRef,
    accessToken: env.SUPABASE_ACCESS_TOKEN,
    fetchImpl,
  });

  const checks = { tasksEndpoint: tasksResult, supabaseProject: supabaseResult };
  const violations = [];
  if (!tasksResult.ok)
    violations.push(violation(`tasks-endpoint-${tasksResult.state}`, tasksResult.message));
  if (!supabaseResult.ok) {
    violations.push(violation(`supabase-project-${supabaseResult.state}`, supabaseResult.message));
  }

  let notified = null;
  if (violations.length > 0) {
    notified = await notify(
      {
        ts: now(),
        kind: 'deploy_error',
        title: 'check-production-health: /ops live data path failed',
        detail: violations.map((v) => v.message).join('\n'),
        task: 'ops#347',
      },
      { fetch: fetchImpl },
    );
  }

  return { violations, checks, notified };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const jsonMode = hasJsonFlag(process.argv);

  const missing = missingEnvViolations(process.env);
  if (missing.length > 0) {
    if (jsonMode) {
      emitResult({ violations: missing, ok: false }, true);
      process.exit(1);
    }
    for (const v of missing) console.error(`check-production-health: ${v.message}`);
    process.exit(2);
  }

  const { violations, checks } = await runHealthCheck();

  if (jsonMode) {
    emitResult(
      {
        violations,
        summary: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.state])),
        ok: violations.length === 0,
      },
      true,
    );
    process.exit(exitCodeFor(violations));
    return;
  }

  for (const [name, result] of Object.entries(checks)) {
    console.log(`${result.ok ? '✓' : '✗'} ${name}: ${result.message}`);
  }
  if (violations.length === 0) {
    console.log('check-production-health: all checks green ✓');
    process.exit(0);
  }
  console.error(`check-production-health: ${violations.length} violation(s).`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (hasJsonFlag(process.argv)) {
      emitResult({ violations: [violation('gate-error', err.message)], ok: false }, true);
      process.exit(1);
    }
    console.error(`check-production-health: ${err.message}`);
    process.exit(2);
  });
}
