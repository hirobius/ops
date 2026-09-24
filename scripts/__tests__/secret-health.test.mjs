import { describe, it, expect } from 'vitest';
import {
  extractSecretNames,
  findUnregisteredSecrets,
  buildVerdict,
  buildViolations,
  EXPIRY_WARN_DAYS,
} from '../../lib/ops/secret-health.mjs';
import { probeAll, fetchFleetSecretNames, WORKFLOW_REPOS } from '../check-secret-health.mjs';

describe('lib/ops/secret-health: extractSecretNames', () => {
  it('finds every secrets.NAME reference', () => {
    const text = `
      env:
        A: \${{ secrets.RELEASE_PAT }}
        B: \${{ secrets.NPM_TOKEN }}
    `;
    expect(extractSecretNames(text)).toEqual(['RELEASE_PAT', 'NPM_TOKEN']);
  });

  it('excludes the auto-injected GITHUB_TOKEN', () => {
    expect(extractSecretNames('${{ secrets.GITHUB_TOKEN }}')).toEqual([]);
  });

  it('allowlists the literal secrets.X prose case (the false positive the issue found)', () => {
    expect(extractSecretNames('# e.g. secrets.X in a comment')).toEqual([]);
  });

  it('dedupes repeats within one file', () => {
    expect(extractSecretNames('${{ secrets.NPM_TOKEN }} ... ${{ secrets.NPM_TOKEN }}')).toEqual([
      'NPM_TOKEN',
    ]);
  });
});

describe('lib/ops/secret-health: findUnregisteredSecrets', () => {
  it('is empty when the registry already covers every grepped name', () => {
    expect(findUnregisteredSecrets(['A', 'B'], ['A', 'B'])).toEqual([]);
  });

  it('reports a workflow-referenced secret the registry does not carry', () => {
    expect(findUnregisteredSecrets(['A'], ['A', 'NEW_SECRET'])).toEqual(['NEW_SECRET']);
  });
});

const entry = (over = {}) => ({
  name: 'RELEASE_PAT',
  repos: ['hirobius/hds'],
  probe: 'github-token-expiry',
  probeStrength: 'verified',
  rotateUrl: 'https://github.com/settings/personal-access-tokens',
  breaksWhenMissing: 'releases fail',
  ...over,
});

describe('lib/ops/secret-health: buildVerdict (the canary — a bogus token goes red)', () => {
  it('a secret this repo does not hold is not-probed, never asserted valid', () => {
    const v = buildVerdict(entry(), { status: 'not-applicable' });
    expect(v.health).toBe('not-probed');
  });

  it('a missing secret this repo DOES hold names the fix, not a generic error', () => {
    const v = buildVerdict(entry({ repos: ['hirobius/ops'] }), { status: 'missing' });
    expect(v.health).toBe('missing');
    expect(v.message).toContain('releases fail');
    expect(v.message).toContain('github.com/hirobius/ops/settings/secrets/actions');
  });

  // THE CANARY: a deliberately bogus/rejected token goes red with the exact
  // secret name and the rotate URL — proving the gate actually fires, not
  // only that it stays quiet on a healthy fixture.
  it('an invalid (rejected) token goes red and names the secret + rotate URL', () => {
    const v = buildVerdict(entry(), { status: 'invalid', detail: 'HTTP 401 from GET /user' });
    expect(v.health).toBe('invalid');
    expect(v.message).toContain('RELEASE_PAT');
    expect(v.message).toContain('HTTP 401');
    expect(v.message).toContain('https://github.com/settings/personal-access-tokens');
    const violations = buildViolations([v]);
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('error');
    expect(violations[0].rule).toBe('SECRET_INVALID');
  });

  it('restoring a valid token (same entry) clears the violation', () => {
    const v = buildVerdict(entry(), { status: 'valid', daysUntilExpiry: 90 });
    expect(v.health).toBe('valid');
    expect(buildViolations([v])).toEqual([]);
  });

  it('a valid token inside the expiry warning window is a warn, not an error', () => {
    const v = buildVerdict(entry(), { status: 'valid', daysUntilExpiry: EXPIRY_WARN_DAYS - 1 });
    expect(v.health).toBe('expiring');
    const violations = buildViolations([v]);
    expect(violations[0].severity).toBe('warn');
  });

  it('a `presence`-probe entry is labelled presence-only, never read as verified', () => {
    const v = buildVerdict(entry({ probe: 'presence', probeStrength: 'weak' }), {
      status: 'valid',
    });
    expect(v.health).toBe('presence-only');
    expect(v.message).toContain('WEAK');
    // presence-only is not itself a violation — it is an honest label, not a failure.
    expect(buildViolations([v])).toEqual([]);
  });
});

describe('check-secret-health: probeAll / fetchFleetSecretNames (no network — stubbed)', () => {
  it('probes an ops-held secret via `presence` from process.env, and skips a foreign one', async () => {
    const registry = [
      entry({
        name: 'RALPH_WATCHDOG_TOKEN',
        repos: ['hirobius/ops'],
        probe: 'presence',
        probeStrength: 'weak',
      }),
      entry({ name: 'NPM_TOKEN', repos: ['hirobius/hds'], probe: 'npm-whoami' }),
    ];
    const verdicts = await probeAll(registry, {
      env: { RALPH_WATCHDOG_TOKEN: 'x' },
      fetchImpl: async () => {
        throw new Error('should not be called for a presence probe');
      },
      execImpl: () => {
        throw new Error('should not be called for a foreign secret');
      },
    });
    expect(verdicts.find((v) => v.name === 'RALPH_WATCHDOG_TOKEN').health).toBe('presence-only');
    expect(verdicts.find((v) => v.name === 'NPM_TOKEN').health).toBe('not-probed');
  });

  it('fetchFleetSecretNames aggregates secrets.NAME across repos and workflow files (stubbed fetch)', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/contents/.github/workflows') && !url.includes('.yml')) {
        return { ok: true, status: 200, json: async () => [{ type: 'file', name: 'ci.yml' }] };
      }
      if (url.includes('/ci.yml')) {
        return { ok: true, status: 200, text: async () => 'env: { A: ${{ secrets.FOO_TOKEN }} }' };
      }
      return { ok: false, status: 404, json: async () => [], text: async () => '' };
    };
    const names = await fetchFleetSecretNames({ repos: ['ops'], token: 't', fetchImpl });
    expect(names).toEqual(['FOO_TOKEN']);
  });

  it('WORKFLOW_REPOS is the four repos that carry workflows', () => {
    expect(WORKFLOW_REPOS).toEqual(['ops', 'hds', 'site-engine', 'Ralph']);
  });
});
