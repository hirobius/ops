/**
 * lib/tasks/fleet.mjs — FLEET_REPOS / filterFleetIssues (ops#405).
 *
 * `listOpenIssues()` (lib/github/issues.mjs) fetches GitHub's
 * authenticated-identity feed — every open issue the token can see, across
 * every owner — so without a filter the fleet count was dominated by repos
 * that were never the fleet (114 of 209 on 2026-09-19: job-hunt, lilac,
 * lilac-bonds, veteran-resource-navigator, access-t, and an unrelated repo in
 * a different org). These tests exercise the pure filter directly, with no
 * token and no fetch, per the DoD's "in-fleet kept, out-of-fleet dropped,
 * empty result, and a repo filter narrowing the count".
 */
import { describe, it, expect } from 'vitest';
import { FLEET_REPOS, filterFleetIssues } from '../../lib/tasks/fleet.mjs';

function issue(repo, number) {
  return { repo, number, title: `issue ${number}` };
}

describe('FLEET_REPOS', () => {
  it('is a non-empty, deduplicated list of owner/repo strings', () => {
    expect(FLEET_REPOS.length).toBeGreaterThan(0);
    expect(new Set(FLEET_REPOS).size).toBe(FLEET_REPOS.length);
    for (const repo of FLEET_REPOS) expect(repo).toMatch(/^[^/]+\/[^/]+$/);
  });
});

describe('filterFleetIssues', () => {
  it('keeps an issue from a fleet repo', () => {
    const kept = filterFleetIssues([issue('hirobius/ops', 1)]);
    expect(kept).toEqual([issue('hirobius/ops', 1)]);
  });

  it('drops an issue from a repo that is not the fleet — the ops#405 bug', () => {
    const dropped = filterFleetIssues([issue('hirobius/job-hunt', 1)]);
    expect(dropped).toEqual([]);
  });

  it('keeps only the in-fleet rows out of a mixed sweep, order preserved', () => {
    const mixed = [
      issue('hirobius/ops', 1),
      issue('hirobius/job-hunt', 2),
      issue('hirobius/hds', 3),
      issue('adr-eng/adrian-milsap', 4),
      issue('hirobius/lilac', 5),
    ];
    expect(filterFleetIssues(mixed)).toEqual([issue('hirobius/ops', 1), issue('hirobius/hds', 3)]);
  });

  it('returns an empty result for an empty sweep', () => {
    expect(filterFleetIssues([])).toEqual([]);
  });

  it('returns an empty result when nothing in the sweep is in the fleet', () => {
    expect(
      filterFleetIssues([issue('hirobius/job-hunt', 1), issue('hirobius/lilac-bonds', 2)]),
    ).toEqual([]);
  });

  it('narrows further to one named fleet repo when `repo` is given', () => {
    const mixed = [issue('hirobius/ops', 1), issue('hirobius/hds', 2), issue('hirobius/ops', 3)];
    expect(filterFleetIssues(mixed, { repo: 'hirobius/ops' })).toEqual([
      issue('hirobius/ops', 1),
      issue('hirobius/ops', 3),
    ]);
  });

  it('narrowing to a repo that is not in the fleet yields nothing, even if it appears in the sweep', () => {
    const mixed = [issue('hirobius/ops', 1), issue('hirobius/job-hunt', 2)];
    expect(filterFleetIssues(mixed, { repo: 'hirobius/job-hunt' })).toEqual([]);
  });
});
