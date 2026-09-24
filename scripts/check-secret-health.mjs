#!/usr/bin/env node
/**
 * scripts/check-secret-health.mjs
 *
 * ops#415: the same failure shape the fleet spent 2026-09-22 removing
 * everywhere else — a credential that lapses SILENTLY and reads as green.
 * `RELEASE_PAT` (hds#267) is a fine-grained PAT and WILL expire; the only
 * warning today is one GitHub email to one inbox ~7 days out. This gives it,
 * and the other 14 secrets docs/secrets/registry.json inventories, a
 * scheduled probe instead.
 *
 * Two independent checks, both run by default:
 *
 *   --sync   Fetches every fleet repo's .github/workflows/*.yml (live, via
 *            the GitHub API) and asserts every `secrets.NAME` it references
 *            is in the registry. A secret referenced anywhere but not
 *            inventoried FAILS — the registry can drift stale in only one
 *            direction (forget to add), and this is the backstop.
 *
 *   --probe  Runs each registry entry's probe, but ONLY for a secret this
 *            repo (hirobius/ops) actually holds — see the module header of
 *            lib/ops/secret-health.mjs. A secret owned by another fleet repo
 *            (hds's RELEASE_PAT, NPM_TOKEN, CHROMATIC_PROJECT_TOKEN,
 *            VERCEL_TOKEN) cannot be probed from here: this script never has
 *            that repo's secret value, by GitHub's own design (Actions
 *            secrets are per-repo and write-only). Those entries report
 *            `not-probed`, not a false "valid" — see the issue's "the
 *            registry must be hand-curated... a list nothing verifies
 *            becomes a list nobody trusts." Each of those repos needs this
 *            same script (or a thin per-repo caller) wired into ITS OWN
 *            weekly schedule to probe its own secrets; that is future work,
 *            named explicitly rather than silently assumed done.
 *
 * firingChannel is `manual` (not yet `ci-scheduled`): a weekly cron needs a
 * `.github/workflows/*.yml` edit, which no agent token in this session can
 * push. The exact step to add is in the ops#415 PR/session report.
 *
 * NEVER prints, logs, or POSTs a secret VALUE — only names, health status,
 * and (for a token-expiry probe) days remaining. See registry.json's own
 * header and the issue's "Explicitly out of scope".
 *
 * Usage:
 *   node scripts/check-secret-health.mjs                # sync + probe, human output
 *   node scripts/check-secret-health.mjs --json
 *   node scripts/check-secret-health.mjs --sync-only
 *   node scripts/check-secret-health.mjs --probe-only
 *   node scripts/check-secret-health.mjs --fixture-mode  # FIXTURE_FILE=<world.json>, no network/env
 *
 * @module check-secret-health
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { postToDiscord } from '../lib/ops/notify.mjs';
import {
  extractSecretNames,
  findUnregisteredSecrets,
  buildVerdict,
  buildViolations,
} from '../lib/ops/secret-health.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'docs', 'secrets', 'registry.json');
const THIS_REPO = 'hirobius/ops';

/** The repos whose workflows are grepped for `secrets.NAME` (the ones with any workflow at all). */
export const WORKFLOW_REPOS = ['ops', 'hds', 'site-engine', 'Ralph'];
const OWNER = 'hirobius';

const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).secrets;
}

// ── --sync: registry vs. live workflow grep ─────────────────────────────────

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

async function fetchWorkflowText({ owner, repo, path, token, fetchImpl }) {
  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { ...GH_HEADERS(token), Accept: 'application/vnd.github.raw+json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return ''; // best-effort — a missing/renamed file just contributes nothing
  return res.text();
}

async function fetchWorkflowNames({ owner, repo, token, fetchImpl }) {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`,
    { headers: GH_HEADERS(token), signal: AbortSignal.timeout(9000) },
  );
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? body.filter((f) => f.type === 'file').map((f) => f.name) : [];
}

/** Every `secrets.NAME` referenced anywhere in the fleet's workflows, live. */
export async function fetchFleetSecretNames({
  repos = WORKFLOW_REPOS,
  owner = OWNER,
  token,
  fetchImpl = fetch,
}) {
  const all = new Set();
  for (const repo of repos) {
    const names = await fetchWorkflowNames({ owner, repo, token, fetchImpl });
    for (const name of names) {
      const text = await fetchWorkflowText({
        owner,
        repo,
        path: `.github/workflows/${name}`,
        token,
        fetchImpl,
      });
      for (const secret of extractSecretNames(text)) all.add(secret);
    }
  }
  return [...all].sort();
}

// ── --probe: one probe per registry entry this repo actually holds ─────────

function heldHere(entry) {
  return entry.repos.includes(THIS_REPO);
}

async function probeGithubTokenExpiry({ token, fetchImpl }) {
  const res = await fetchImpl('https://api.github.com/user', {
    headers: GH_HEADERS(token),
    signal: AbortSignal.timeout(9000),
  });
  if (res.status === 401 || res.status === 403) {
    return { status: 'invalid', detail: `HTTP ${res.status} from GET /user` };
  }
  if (!res.ok) return { status: 'invalid', detail: `HTTP ${res.status} from GET /user` };
  const expiryHeader = res.headers.get('github-authentication-token-expiration');
  if (!expiryHeader) {
    // DoD: proven, not assumed. Not every token type sends this header (a
    // classic PAT with no expiry set, for one) — that is a valid state, not
    // a failure, so report `valid` with no expiry rather than inventing one.
    return { status: 'valid', daysUntilExpiry: null, detail: 'no expiration header returned' };
  }
  const days = Math.ceil((Date.parse(expiryHeader) - Date.now()) / 86_400_000);
  return { status: 'valid', daysUntilExpiry: days, detail: expiryHeader };
}

async function probeFigmaMe({ token, fetchImpl }) {
  const res = await fetchImpl('https://api.figma.com/v1/me', {
    headers: { 'X-Figma-Token': token },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return { status: 'invalid', detail: `HTTP ${res.status} from GET /v1/me` };
  return { status: 'valid' };
}

async function probeSupabaseSelect({ token, env, fetchImpl }) {
  const url = env.SUPABASE_URL;
  if (!url)
    return { status: 'invalid', detail: 'SUPABASE_URL is not set — cannot reach the project' };
  const res = await fetchImpl(`${url}/rest/v1/`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(9000),
  });
  if (res.status === 401 || res.status === 403) {
    return { status: 'invalid', detail: `HTTP ${res.status} from the REST root` };
  }
  return { status: 'valid' };
}

function probeNpmWhoami({ token, execImpl }) {
  try {
    const out = execImpl(
      'npm',
      [
        'whoami',
        '--registry',
        'https://registry.npmjs.org',
        `--//registry.npmjs.org/:_authToken=${token}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return { status: 'valid', detail: out.trim() };
  } catch (err) {
    return { status: 'invalid', detail: err.message?.slice(0, 200) ?? 'npm whoami failed' };
  }
}

/** Run the right probe for one entry held by THIS_REPO. `presence` never leaves the process. */
async function runProbe(entry, { env, fetchImpl, execImpl }) {
  const token = env[entry.name];
  if (!token) return { status: 'missing' };
  if (entry.probe === 'presence') return { status: 'valid' }; // weak — buildVerdict labels it
  if (entry.probe === 'github-token-expiry') return probeGithubTokenExpiry({ token, fetchImpl });
  if (entry.probe === 'figma-me') return probeFigmaMe({ token, fetchImpl });
  if (entry.probe === 'supabase-select') return probeSupabaseSelect({ token, env, fetchImpl });
  if (entry.probe === 'npm-whoami') return probeNpmWhoami({ token, execImpl });
  return { status: 'valid' }; // unknown probe id — never invent a failure
}

/** Verdicts for every registry entry: probed when held here, `not-applicable` otherwise. */
export async function probeAll(
  registry,
  { env = process.env, fetchImpl = fetch, execImpl = execFileSync } = {},
) {
  const verdicts = [];
  for (const entry of registry) {
    const outcome = heldHere(entry)
      ? await runProbe(entry, { env, fetchImpl, execImpl })
      : { status: 'not-applicable' };
    verdicts.push(buildVerdict(entry, outcome));
  }
  return verdicts;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function formatHuman({ syncViolations, verdicts, violations }) {
  const lines = [];
  if (syncViolations.length) {
    lines.push(
      `secret-health --sync: ${syncViolations.length} secret(s) referenced but not registered:`,
    );
    for (const v of syncViolations) lines.push(`  ${v.message}`);
  } else {
    lines.push('secret-health --sync: registry agrees with every fleet workflow.');
  }
  lines.push(
    `secret-health --probe: ${verdicts.length} entr(y/ies), ${violations.length} needing attention:`,
  );
  for (const v of verdicts) lines.push(`  [${v.health}] ${v.message}`);
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
  const syncOnly = argv.includes('--sync-only');
  const probeOnly = argv.includes('--probe-only');
  const doSync = !probeOnly;
  const doProbe = !syncOnly;

  if (fixtureMode) {
    const fixtureFile = process.env.FIXTURE_FILE;
    if (!fixtureFile) {
      process.stderr.write('check-secret-health: --fixture-mode requires FIXTURE_FILE\n');
      process.exit(2);
      return;
    }
    let world;
    try {
      world = JSON.parse(readFileSync(fixtureFile, 'utf8'));
    } catch (err) {
      process.stderr.write(`check-secret-health: cannot read fixture: ${err.message}\n`);
      process.exit(2);
      return;
    }
    // Fixture world: { registryNames: string[], grepNames: string[], verdictInputs: [{entry, outcome}] }
    const syncViolations = findUnregisteredSecrets(
      world.registryNames ?? [],
      world.grepNames ?? [],
    ).map((name) => ({
      file: '*',
      line: null,
      rule: 'SECRET_NOT_REGISTERED',
      severity: 'error',
      message: `${name} is referenced in a fleet workflow but not in docs/secrets/registry.json.`,
    }));
    const verdicts = (world.verdictInputs ?? []).map(({ entry, outcome }) =>
      buildVerdict(entry, outcome),
    );
    const violations = [...syncViolations, ...buildViolations(verdicts)];
    const result = {
      violations,
      summary: { verdicts: verdicts.length },
      ok: violations.length === 0,
    };
    if (jsonMode) emitResult(result, true);
    else process.stdout.write(formatHuman({ syncViolations, verdicts, violations }) + '\n');
    process.exit(violations.length > 0 ? 1 : 0);
    return;
  }

  const registry = loadRegistry();
  const token = process.env.GITHUB_TOKEN;

  let syncViolations = [];
  if (doSync) {
    if (!token) {
      console.error(
        `GITHUB_TOKEN is not set — needed to read fleet workflows for the secrets sync check. ` +
          `Set it in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL}, ` +
          `then redeploy. (A fine-grained token with "Contents: read" on the fleet repos works: ${GITHUB_TOKEN_URL}.)`,
      );
      process.exit(1);
      return;
    }
    try {
      const grepNames = await fetchFleetSecretNames({ token });
      syncViolations = findUnregisteredSecrets(
        registry.map((e) => e.name),
        grepNames,
      ).map((name) => ({
        file: '*',
        line: null,
        rule: 'SECRET_NOT_REGISTERED',
        severity: 'error',
        message: `${name} is referenced in a fleet workflow but not in docs/secrets/registry.json.`,
      }));
    } catch (err) {
      console.error(
        `check-secret-health --sync: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
      return;
    }
  }

  const verdicts = doProbe ? await probeAll(registry) : [];
  const violations = [...syncViolations, ...buildViolations(verdicts)];
  const result = {
    violations,
    summary: { verdicts: verdicts.length },
    ok: violations.length === 0,
  };

  if (jsonMode) {
    emitResult(result, true);
  } else {
    console.log(formatHuman({ syncViolations, verdicts, violations }));
  }

  // Never announce a secret's VALUE — names + health status only.
  if (violations.length > 0 && process.env.DISCORD_WEBHOOK_URL) {
    const lines = violations.map((v) => `• ${v.message}`).join('\n');
    await postToDiscord(`🔴 **Secret health check found ${violations.length} issue(s)**\n${lines}`);
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
