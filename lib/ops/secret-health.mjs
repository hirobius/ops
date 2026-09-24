/**
 * lib/ops/secret-health.mjs — pure logic for scripts/check-secret-health.mjs
 * (ops#415).
 *
 * Two independent jobs, both pure and independently testable:
 *
 *  1. extractSecretNames / findUnregisteredSecrets — keep docs/secrets/
 *     registry.json honest against what the fleet's workflows ACTUALLY
 *     reference, so the inventory cannot silently fall behind (the failure
 *     the issue opens with: RELEASE_PAT existed in a workflow for a day
 *     before anything tracked it).
 *
 *  2. buildVerdict / buildViolations — turn one secret's probe OUTCOME
 *     (already computed by the I/O half, or supplied directly by a fixture)
 *     into a labelled health verdict and, where it matters, a canonical
 *     violation. The probe I/O never lives here — this module only decides
 *     what a result MEANS, same split as branch-ancestry.mjs /
 *     ralph-watchdog.mjs.
 */

/** `secrets.X` inside a comment (the false positive the issue itself found in hds's release.yml). */
export const PROSE_ALLOWLIST = ['X'];

/** Injected by GitHub itself, per job — never a stored, rotatable secret. */
export const BUILTIN_EXCLUDED = ['GITHUB_TOKEN'];

/** Every `secrets.NAME` reference in one workflow file's text, minus known non-secrets. */
export function extractSecretNames(workflowText) {
  const names = new Set();
  const re = /secrets\.([A-Z_][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(workflowText || ''))) {
    const name = m[1];
    if (BUILTIN_EXCLUDED.includes(name) || PROSE_ALLOWLIST.includes(name)) continue;
    names.add(name);
  }
  return [...names];
}

/** Names the fleet's workflows reference that the registry does not carry — the drift the issue exists to catch. */
export function findUnregisteredSecrets(registryNames, grepNames) {
  const known = new Set(registryNames);
  return [...new Set(grepNames)].filter((n) => !known.has(n)).sort();
}

/** Warn once expiry is this close — matches the issue's DoD. */
export const EXPIRY_WARN_DAYS = 14;

/**
 * @typedef {Object} ProbeOutcome
 * @property {'not-applicable'|'missing'|'invalid'|'valid'} status
 *   not-applicable — this repo does not hold this secret (can't probe it from here)
 *   missing        — this repo DOES hold it, but it's unset/empty here
 *   invalid        — probed and the credential itself was rejected
 *   valid          — probed (or, for a `presence` probe, merely present) and not invalid
 * @property {number|null} [daysUntilExpiry]  From a `github-token-expiry` probe, when known.
 * @property {string} [detail]  Probe-specific detail (e.g. the HTTP status, the npm user).
 */

/**
 * One secret's registry entry + its probe outcome → a labelled verdict.
 * @param {{name:string, repos:string[], probe:string, probeStrength:'verified'|'weak', rotateUrl:string|null, breaksWhenMissing:string}} entry
 * @param {ProbeOutcome} outcome
 */
export function buildVerdict(entry, outcome) {
  const base = { name: entry.name, probe: entry.probe, probeStrength: entry.probeStrength };

  if (outcome.status === 'not-applicable') {
    return {
      ...base,
      health: 'not-probed',
      message: `${entry.name}: not held by this repo's own Actions secrets — probe it from ${entry.repos.join(', ')} instead.`,
    };
  }

  if (outcome.status === 'missing') {
    return {
      ...base,
      health: 'missing',
      message: `${entry.name} is missing. ${entry.breaksWhenMissing} Set it at ${entry.repos[0] ? `https://github.com/${entry.repos[0]}/settings/secrets/actions` : "the repo's Actions secrets page"}${entry.rotateUrl ? ` (get a value at ${entry.rotateUrl})` : ''}.`,
    };
  }

  if (outcome.status === 'invalid') {
    return {
      ...base,
      health: 'invalid',
      message: `${entry.name} is invalid or revoked (${outcome.detail ?? 'probe rejected it'}). ${entry.breaksWhenMissing} Rotate it${entry.rotateUrl ? ` at ${entry.rotateUrl}` : ''}.`,
    };
  }

  // valid
  if (entry.probeStrength === 'weak') {
    return {
      ...base,
      health: 'presence-only',
      message: `${entry.name} is present — probe strength is WEAK (presence only, not independently verified as a working credential).`,
    };
  }

  if (typeof outcome.daysUntilExpiry === 'number' && outcome.daysUntilExpiry < EXPIRY_WARN_DAYS) {
    return {
      ...base,
      health: 'expiring',
      message: `${entry.name} expires in ${outcome.daysUntilExpiry} day(s). Rotate it now at ${entry.rotateUrl ?? '(no rotate URL on file)'} before it lapses.`,
    };
  }

  return {
    ...base,
    health: 'valid',
    message:
      typeof outcome.daysUntilExpiry === 'number'
        ? `${entry.name} is valid — ${outcome.daysUntilExpiry} day(s) until expiry.`
        : `${entry.name} is valid.`,
  };
}

/** Canonical-shape violations: `missing`/`invalid` are errors, `expiring` is a warning. Everything else is clean. */
export function buildViolations(verdicts) {
  return verdicts
    .filter((v) => v.health === 'missing' || v.health === 'invalid' || v.health === 'expiring')
    .map((v) => ({
      file: '*',
      line: null,
      rule: `SECRET_${v.health.toUpperCase().replace('-', '_')}`,
      severity: v.health === 'expiring' ? 'warn' : 'error',
      message: v.message,
      secret: v.name,
    }));
}
