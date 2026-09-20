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
 *   SUPABASE_ACCESS_TOKEN   optional — enables the direct project-status check. Only
 *                          this script reads it (from the repo's Actions secrets
 *                          when scheduled); nothing deployed on Vercel does.
 *   SUPABASE_PROJECT_REF    optional — defaults to the ops project (vvyccwxtcwvlusweenje).
 *
 * Scheduled caller: .github/workflows/production-health.yml (#318) runs this
 * every 6h, reading OPS_AGENT_KEY / DISCORD_WEBHOOK_URL / SUPABASE_ACCESS_TOKEN
 * from the repo's Actions secrets. That workflow's header is the one place the
 * secret setup is documented.
 *
 * Exit codes: 0 healthy · 1 unhealthy (or --json config error) · 2 invocation
 * error (missing required env, non-json mode).
 *
 * @module check-production-health
 */

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult, exitCodeFor } from './lib/gate-output.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

const VERCEL_PROJECT_URL = 'https://vercel.com/adrian-6234s-projects/hirobius-ops';
const VERCEL_ENV_URL = `${VERCEL_PROJECT_URL}/settings/environment-variables`;
const SUPABASE_TOKENS_URL = 'https://supabase.com/dashboard/account/tokens';
/** Where the scheduled caller (.github/workflows/production-health.yml, #318) reads its secrets. */
const GITHUB_SECRETS_URL = 'https://github.com/hirobius/ops/settings/secrets/actions';
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

/**
 * Best-effort read of an ops API error body (`{ error, code? }`, per
 * lib/api/handler.ts). Never throws: a non-JSON body (a platform error page)
 * yields `{}`. The server's own message is truncated — it lands in Discord and
 * in a public Actions log, and only needs to say what went wrong.
 *
 * @param {{ json: () => Promise<unknown> }} res
 * @returns {Promise<{ error?: string, code?: string }>}
 */
async function errorBodyOf(res) {
  try {
    const body = /** @type {any} */ (await res.json());
    const out = {};
    if (typeof body?.error === 'string' && body.error.trim()) out.error = body.error.slice(0, 200);
    if (typeof body?.code === 'string' && body.code.trim()) out.code = body.code.slice(0, 60);
    return out;
  } catch {
    return {};
  }
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

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      state: 'unauthorized',
      message:
        `GET ${url} rejected OPS_AGENT_KEY (HTTP ${res.status}) — the key this check sends does not ` +
        `match the deployment's OPS_AGENT_KEY (or it is unset there). Set the same value in Vercel ` +
        `(Production): ${VERCEL_ENV_URL} and in the GitHub Actions secret the cron reads: ${GITHUB_SECRETS_URL}`,
    };
  }

  if (!res.ok) {
    const { error, code } = await errorBodyOf(res);
    const said = [code, error].filter(Boolean).join(': ');
    const head = `GET ${url} returned HTTP ${res.status}${said ? ` (${said})` : ''}`;

    // lib/api/handler.ts withServiceClient: the deployment has no Supabase env.
    if (code === 'ENV_MISSING_SUPABASE') {
      return {
        ok: false,
        state: 'http_error',
        message:
          `${head} — the deployment cannot find its Supabase credentials. Set SUPABASE_URL and ` +
          `SUPABASE_SERVICE_ROLE_KEY in Vercel (Production), then redeploy: ${VERCEL_ENV_URL}`,
      };
    }

    // A paused or unreachable database surfaces here, not only as the empty
    // 200: api/tasks.ts answers { status: 500, body: { error } } when listTasks
    // fails, and a hung query times the function out (504).
    if (res.status >= 500) {
      return {
        ok: false,
        state: 'http_error',
        message:
          `${head} — the most likely cause is the Supabase database (paused on the free-tier ` +
          `7-day idle timer, or unreachable). Check the project status and resume it: ` +
          `${resumeUrl(projectRef)} — if the database is healthy, check the deployment: ${VERCEL_PROJECT_URL}`,
      };
    }

    return {
      ok: false,
      state: 'http_error',
      message: `${head} — check the deployment: ${VERCEL_PROJECT_URL}`,
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
        `(INACTIVE/COMING_UP/RESTORING detail). Create one at ${SUPABASE_TOKENS_URL} and add it ` +
        `as the GitHub Actions secret the cron reads (nothing on Vercel uses it): ${GITHUB_SECRETS_URL}`,
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
        `expired/revoked. Rotate it at ${SUPABASE_TOKENS_URL} and update the GitHub Actions secret ` +
        `the cron reads: ${GITHUB_SECRETS_URL}`,
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
    try {
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
    } catch (e) {
      // The Discord leg never throws, but the event-log append can. Keep the
      // violations: a notify failure must not hide what was wrong.
      notified = { appended: null, discord: { sent: false, reason: `notify threw: ${e.message}` } };
    }
  }

  return { violations, checks, notified };
}

// ── Page delivery ────────────────────────────────────────────────────────────

/**
 * Did a failing run actually reach Discord? `notifyEvent` is fail-soft — it
 * resolves `{ discord: { sent: false, reason } }` instead of throwing — so a
 * dead webhook would otherwise leave a red run with no page and no trace.
 *
 * @param {Array<object>} violations
 * @param {{ discord?: { sent: boolean, reason?: string } } | null} notified
 * @returns {{ paged: boolean, undeliveredReason: string | null }}
 */
export function pageDelivery(violations, notified) {
  if (violations.length === 0) return { paged: false, undeliveredReason: null };
  const discord = notified?.discord;
  if (discord?.sent) return { paged: true, undeliveredReason: null };
  return {
    paged: false,
    undeliveredReason: discord?.reason || 'the notify seam returned no Discord result',
  };
}

/** Escapes workflow-command data so a multi-line reason stays one annotation. */
function escapeWorkflowData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Hands the delivery outcome to the scheduled caller. Writes `paged=true|false`
 * to `$GITHUB_OUTPUT` (the workflow's fallback page keys off it), and when a
 * failing run's page did not go out, prints a GitHub `::error` annotation that
 * names the variable and where to fix it.
 *
 * @param {{ paged: boolean, undeliveredReason: string | null }} delivery
 * @param {{ env?: NodeJS.ProcessEnv, appendFile?: typeof appendFileSync, log?: (line: string) => void }} [opts]
 */
export function reportPageDelivery(
  delivery,
  { env = process.env, appendFile = appendFileSync, log = console.log } = {},
) {
  if (env.GITHUB_OUTPUT) appendFile(env.GITHUB_OUTPUT, `paged=${delivery.paged}\n`, 'utf8');
  if (!delivery.undeliveredReason) return;
  const message =
    `check-production-health failed but its Discord page was not delivered: ` +
    `${delivery.undeliveredReason} — check that DISCORD_WEBHOOK_URL still points at a live ` +
    `webhook and update the GitHub Actions secret: ${GITHUB_SECRETS_URL}`;
  log(
    env.GITHUB_ACTIONS === 'true'
      ? `::error title=Discord page not delivered::${escapeWorkflowData(message)}`
      : message,
  );
}

// ── Fixture mode ─────────────────────────────────────────────────────────────

/**
 * Builds a canned `fetch` from a fixture, so proof-of-firing can exercise the
 * real decision path with no network and no deployed app.
 *
 * WHY THIS EXISTS: this gate's whole point is that a **200 is not health** — a
 * paused Supabase project returns a clean `{ tasks: [] }`. A stub fixture
 * cannot demonstrate that; only running the gate against the known-failing
 * shape can. ops#347's DoD asked for exactly this ("proven by asserting against
 * the known-failing shape, not assumed"), and the stub left the gate counted
 * among the 32 that cannot prove they fire.
 *
 * Fixture shape:
 *   { "tasks": { "status": 200, "body": { "tasks": [] } },
 *     "supabaseStatus": "INACTIVE" }
 *
 * `supabaseStatus` is optional; omit it to exercise the skipped path.
 *
 * @param {object} fixture
 * @returns {Function} a fetch-shaped function routing by URL
 */
export function makeFixtureFetch(fixture) {
  return async (url) => {
    if (String(url).includes('/api/tasks')) {
      const t = fixture.tasks || {};
      return {
        ok: (t.status ?? 200) >= 200 && (t.status ?? 200) < 300,
        status: t.status ?? 200,
        json: async () => t.body,
      };
    }
    if (String(url).includes('api.supabase.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: fixture.supabaseStatus }),
      };
    }
    // Any other call (e.g. the Discord notify seam) is a no-op in fixture mode.
    return { ok: true, status: 204, json: async () => ({}) };
  };
}

async function runFixtureMode(fixturePath, jsonMode) {
  const { readFile } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

  const { violations } = await runHealthCheck({
    env: {
      OPS_BASE_URL: 'https://fixture.invalid',
      OPS_AGENT_KEY: 'fixture',
      // Only enable the Supabase check when the fixture actually pins a status.
      ...(fixture.supabaseStatus ? { SUPABASE_ACCESS_TOKEN: 'fixture' } : {}),
    },
    fetchImpl: makeFixtureFetch(fixture),
    // Never reach Discord from a fixture run.
    notify: async () => null,
    now: () => '1970-01-01T00:00:00.000Z',
  });

  if (jsonMode) {
    emitResult({ violations, ok: violations.length === 0 }, true);
  } else {
    for (const v of violations) console.error(`check-production-health: ${v.message}`);
    if (violations.length === 0) console.log('check-production-health: fixture is healthy ✓');
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const jsonMode = hasJsonFlag(process.argv);

  // Fixture mode short-circuits before the env gate: proof-of-firing runs in
  // CI with no OPS_BASE_URL and must exercise behaviour, not configuration.
  const fixtureMode =
    process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
  if (fixtureMode && process.env.FIXTURE_FILE) {
    return runFixtureMode(process.env.FIXTURE_FILE, jsonMode);
  }

  const missing = missingEnvViolations(process.env);
  if (missing.length > 0) {
    if (jsonMode) {
      emitResult({ violations: missing, ok: false }, true);
      process.exit(1);
    }
    for (const v of missing) console.error(`check-production-health: ${v.message}`);
    process.exit(2);
  }

  const { violations, checks, notified } = await runHealthCheck();
  const delivery = pageDelivery(violations, notified);

  if (jsonMode) {
    // --json keeps stdout JSON-only (scripts/lib/gate-output.mjs), so the
    // annotation goes to stderr there.
    reportPageDelivery(delivery, { log: console.error });
    emitResult(
      {
        violations,
        summary: {
          ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.state])),
          paged: delivery.paged,
        },
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
  reportPageDelivery(delivery);
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
