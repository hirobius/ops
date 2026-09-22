/**
 * scripts/lib/secret-probes.mjs — the five probe implementations
 * check-secret-health.mjs dispatches to, keyed by docs/secrets/registry.json's
 * `probe` field (ops#415).
 *
 * Every probe takes `{ value, env, fetchImpl }` and returns
 * `{ ok: boolean, verified: boolean, daysRemaining: number|null, message: string }`:
 *   ok             true iff the secret is usable right now
 *   verified       true iff `ok` was established by actually authenticating
 *                  against the live service (matches the registry entry's
 *                  `probeStrength: "verified"`) rather than merely checking
 *                  the env var is non-empty (`"presence-only"`). A caller
 *                  must never let a presence-only pass read as verified —
 *                  this field is what check-secret-health.mjs prints from,
 *                  not the registry's static `probeStrength`, so a `verified`
 *                  probe that degrades (network error, say) reports honestly.
 *   daysRemaining  number of days until known expiry, or null when the
 *                  service doesn't expose one (most don't).
 *   message        human-readable detail — NEVER the secret value itself.
 *
 * `value` is the secret's own value; `env` is the full env (some probes need
 * a companion var, e.g. supabase-select on SUPABASE_SERVICE_ROLE_KEY also
 * needs SUPABASE_URL). `fetchImpl` defaults to the global `fetch` and exists
 * so tests can inject a fake — no probe here is unit-tested against the real
 * network.
 *
 * GitHub token expiry (github-token-expiry): CONFIRMED live in this
 * environment (2026-09-22) — a real `GET https://api.github.com/user` call
 * authenticated with this sandbox's own GITHUB_TOKEN returned a
 * `Github-Authentication-Token-Expiration` response header
 * (`2026-09-22 18:31:15 UTC`). That was Actions' own short-lived per-run
 * token, not a long-lived fine-grained PAT (github.com/settings/personal-
 * access-tokens), so the header's presence on OUR real secrets
 * (RALPH_WATCHDOG_TOKEN) is unverified — this probe reads the header when
 * present and falls back to a hand-recorded `expiresAt` on the registry
 * entry when it is absent, per ops#415's instruction not to ship a probe
 * whose mechanism hasn't been confirmed to hold in at least one case.
 *
 * @module secret-probes
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** presence — the only probe every secret can fall back to. */
export async function probePresence({ value }) {
  const set = typeof value === 'string' && value.trim().length > 0;
  return {
    ok: set,
    verified: false,
    daysRemaining: null,
    message: set
      ? 'set (presence only — value not authenticated against any live service)'
      : 'not set',
  };
}

/**
 * github-token-expiry — GET /user (or /rate_limit, if the secret carries no
 * scopes) with the token, then reads `Github-Authentication-Token-Expiration`.
 * 401/403 = invalid. Header absent = falls back to `entry.expiresAt` (an
 * ISO date hand-recorded in the registry) if the caller supplies one.
 */
export async function probeGithubTokenExpiry({
  value,
  fetchImpl = fetch,
  expiresAt,
  now = new Date(),
}) {
  if (!value) return { ok: false, verified: false, daysRemaining: null, message: 'not set' };

  let res;
  try {
    res = await fetchImpl('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${value}`, Accept: 'application/vnd.github+json' },
    });
  } catch (err) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `network error reaching api.github.com: ${err.message}`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `GitHub rejected the token (HTTP ${res.status}) — invalid or revoked`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `GitHub API returned HTTP ${res.status}`,
    };
  }

  const header = res.headers.get('github-authentication-token-expiration');
  if (header) {
    // GitHub's format: "2026-09-22 18:31:15 UTC" — replace the space before
    // the offset with 'T' and treat "UTC" as 'Z' so Date can parse it.
    const iso = header.replace(' UTC', 'Z').replace(' ', 'T');
    const expiry = new Date(iso);
    if (!Number.isNaN(expiry.getTime())) {
      const daysRemaining = daysBetween(now, expiry);
      return {
        ok: daysRemaining >= 0,
        verified: true,
        daysRemaining,
        message:
          daysRemaining < 0
            ? `token expired ${Math.abs(daysRemaining)} day(s) ago (${header})`
            : `valid, expires ${header} (${daysRemaining} day(s) remaining) — read from GitHub's response header`,
      };
    }
  }

  // No usable header. Valid right now (we got a 2xx), but expiry is unknown
  // unless the registry recorded one by hand.
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (!Number.isNaN(expiry.getTime())) {
      const daysRemaining = daysBetween(now, expiry);
      return {
        ok: daysRemaining >= 0,
        verified: true,
        daysRemaining,
        message:
          daysRemaining < 0
            ? `token expired ${Math.abs(daysRemaining)} day(s) ago per registry expiresAt (${expiresAt}) — GitHub sent no expiration header for this token`
            : `valid; ${daysRemaining} day(s) remaining per registry expiresAt (${expiresAt}) — GitHub sent no expiration header for this token`,
      };
    }
  }

  return {
    ok: true,
    verified: true,
    daysRemaining: null,
    message:
      'valid, but GitHub sent no expiration header and the registry has no expiresAt fallback — expiry unknown',
  };
}

/** npm-whoami — GET the npm registry's own whoami endpoint with the token. */
export async function probeNpmWhoami({ value, fetchImpl = fetch }) {
  if (!value) return { ok: false, verified: false, daysRemaining: null, message: 'not set' };
  let res;
  try {
    res = await fetchImpl('https://registry.npmjs.org/-/whoami', {
      headers: { Authorization: `Bearer ${value}` },
    });
  } catch (err) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `network error reaching registry.npmjs.org: ${err.message}`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `npm rejected the token (HTTP ${res.status}) — invalid, revoked, or expired`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `npm registry returned HTTP ${res.status}`,
    };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: 'npm registry returned a non-JSON 200 — unexpected response shape',
    };
  }
  return {
    ok: Boolean(body?.username),
    verified: true,
    daysRemaining: null,
    message: body?.username
      ? `authenticates as npm user "${body.username}"`
      : 'npm returned 200 but no username — unexpected response shape',
  };
}

/** figma-me — GET /v1/me with the token in X-Figma-Token. */
export async function probeFigmaMe({ value, fetchImpl = fetch }) {
  if (!value) return { ok: false, verified: false, daysRemaining: null, message: 'not set' };
  let res;
  try {
    res = await fetchImpl('https://api.figma.com/v1/me', { headers: { 'X-Figma-Token': value } });
  } catch (err) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `network error reaching api.figma.com: ${err.message}`,
    };
  }
  if (res.status === 403 || res.status === 401) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `Figma rejected the token (HTTP ${res.status}) — invalid or revoked`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `Figma API returned HTTP ${res.status}`,
    };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: 'Figma returned a non-JSON 200 — unexpected response shape',
    };
  }
  return {
    ok: Boolean(body?.id),
    verified: true,
    daysRemaining: null,
    message: body?.id
      ? `authenticates as Figma user "${body.email ?? body.id}"`
      : 'Figma returned 200 but no user id — unexpected response shape',
  };
}

/**
 * supabase-select — two shapes, dispatched on which secret name is being
 * probed (both do a literal read-only select; nothing here writes):
 *
 *   SUPABASE_SERVICE_ROLE_KEY: GET {SUPABASE_URL}/rest/v1/leads?select=id&limit=1
 *     via PostgREST. Needs env.SUPABASE_URL as a companion value.
 *   SUPABASE_ACCESS_TOKEN: POST to the Management API's database/query
 *     endpoint with `select 1;` — the same mechanism
 *     scripts/check-migration-ledger.mjs already uses to read the migration
 *     ledger, reused here rather than reinvented. Needs a project ref
 *     (env.SUPABASE_PROJECT_REF, defaulting to the ops project).
 */
const DEFAULT_SUPABASE_PROJECT_REF = 'vvyccwxtcwvlusweenje';

export async function probeSupabaseSelect({ name, value, env = {}, fetchImpl = fetch }) {
  if (!value) return { ok: false, verified: false, daysRemaining: null, message: 'not set' };

  if (name === 'SUPABASE_ACCESS_TOKEN') {
    const projectRef = env.SUPABASE_PROJECT_REF?.trim() || DEFAULT_SUPABASE_PROJECT_REF;
    let res;
    try {
      res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'select 1;' }),
      });
    } catch (err) {
      return {
        ok: false,
        verified: true,
        daysRemaining: null,
        message: `network error reaching the Supabase Management API: ${err.message}`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        verified: true,
        daysRemaining: null,
        message: `Supabase Management API rejected the token (HTTP ${res.status}) — invalid or revoked`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        verified: true,
        daysRemaining: null,
        message: `Supabase Management API returned HTTP ${res.status} for \`select 1;\` against project ${projectRef}`,
      };
    }
    return {
      ok: true,
      verified: true,
      daysRemaining: null,
      message: `\`select 1;\` succeeded against project ${projectRef} via the Management API`,
    };
  }

  // SUPABASE_SERVICE_ROLE_KEY (or any other PostgREST-style key).
  const rawBaseUrl = env.SUPABASE_URL?.trim();
  if (!rawBaseUrl) {
    return {
      ok: false,
      verified: false,
      daysRemaining: null,
      message: 'SUPABASE_URL is not set — cannot build the PostgREST request to verify this key',
    };
  }
  // Same sanitization as lib/supabase/server.mjs's getServiceClient(): a
  // dashboard-pasted URL often carries a trailing slash or the full
  // /rest/v1 endpoint already, either of which builds a doubled, invalid
  // path ("PGRST125: Invalid path specified in request URL") if appended to
  // blindly — confirmed live against the real ops project while building
  // this probe (ops#415).
  const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
  let res;
  try {
    res = await fetchImpl(`${baseUrl}/rest/v1/leads?select=id&limit=1`, {
      headers: { apikey: value, Authorization: `Bearer ${value}` },
    });
  } catch (err) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `network error reaching ${baseUrl}: ${err.message}`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `PostgREST rejected the key (HTTP ${res.status}) — invalid or revoked`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: true,
      daysRemaining: null,
      message: `PostgREST returned HTTP ${res.status} selecting from "leads"`,
    };
  }
  return {
    ok: true,
    verified: true,
    daysRemaining: null,
    message: 'select id from leads limit 1 succeeded via PostgREST',
  };
}

/** Dispatch table keyed by the registry's `probe` field. */
export const PROBES = {
  presence: probePresence,
  'github-token-expiry': probeGithubTokenExpiry,
  'npm-whoami': probeNpmWhoami,
  'figma-me': probeFigmaMe,
  'supabase-select': probeSupabaseSelect,
};

/** Days-remaining threshold at which check-secret-health.mjs warns (not fails). */
export const WARN_DAYS = 14;
