/**
 * repoScope — the pure half of Standing's repo filter: which repos the loaded
 * sweep holds, how much is open in each, which one `?repo=` names, and which
 * rows survive the filter. No React, no router; the page and the chip row are
 * thin consumers of these.
 */
import { describe, it, expect } from 'vitest';
import { filterByRepo, repoOptions, resolveRepoParam } from './repoScope';

const row = (repo: string) => ({ repo });

describe('repoOptions', () => {
  it('counts every issue and PR lane per repo, busiest first', () => {
    const options = repoOptions({
      blocked: [row('hirobius/ops'), row('hirobius/client-alpha')],
      queue: [row('hirobius/ops')],
      backlog: [row('hirobius/job-hunt'), row('hirobius/job-hunt'), row('hirobius/job-hunt')],
      prs: [row('hirobius/ops')],
    });

    expect(options).toEqual([
      { repo: 'hirobius/job-hunt', param: 'job-hunt', issues: 3, prs: 0, count: 3 },
      { repo: 'hirobius/ops', param: 'ops', issues: 2, prs: 1, count: 3 },
      { repo: 'hirobius/client-alpha', param: 'client-alpha', issues: 1, prs: 0, count: 1 },
    ]);
  });

  it('keeps the owner in the param when two owners share a repo name', () => {
    const options = repoOptions({
      blocked: [row('hirobius/site'), row('adr-eng/site')],
      queue: [row('hirobius/ops')],
      backlog: [],
      prs: [],
    });

    expect(options.map((o) => o.param)).toEqual(['adr-eng/site', 'hirobius/site', 'ops']);
  });

  it('counts names differing only in case as a collision — the param resolves case-insensitively', () => {
    const options = repoOptions({
      blocked: [row('adr-eng/site'), row('adr-eng/site'), row('hirobius/Site')],
      queue: [],
      backlog: [],
      prs: [],
    });

    expect(options.map((o) => o.param)).toEqual(['adr-eng/site', 'hirobius/Site']);
  });

  it('holds nothing when every lane is empty', () => {
    expect(repoOptions({ blocked: [], queue: [], backlog: [], prs: [] })).toEqual([]);
  });
});

describe('resolveRepoParam', () => {
  const options = repoOptions({
    blocked: [row('hirobius/ops'), row('hirobius/site'), row('adr-eng/site')],
    queue: [row('hirobius/job-hunt')],
    backlog: [],
    prs: [],
  });

  it('means every repo when the param is absent or blank', () => {
    const all = { selected: null, unknown: null, ambiguous: null };
    expect(resolveRepoParam(null, options)).toEqual(all);
    expect(resolveRepoParam('', options)).toEqual(all);
    expect(resolveRepoParam('   ', options)).toEqual(all);
  });

  it('selects the repo a short param names', () => {
    expect(resolveRepoParam('job-hunt', options).selected?.repo).toBe('hirobius/job-hunt');
  });

  it('accepts the full owner/repo too, ignoring case — GitHub names are case-insensitive', () => {
    expect(resolveRepoParam('Hirobius/OPS', options)).toEqual({
      selected: expect.objectContaining({ repo: 'hirobius/ops' }),
      unknown: null,
      ambiguous: null,
    });
  });

  it('falls back to every repo and reports the value when nothing matches', () => {
    expect(resolveRepoParam('portal-kit', options)).toEqual({
      selected: null,
      unknown: 'portal-kit',
      ambiguous: null,
    });
  });

  it('reports an ambiguous short name with every repo it matches — not as a typo, and never guessing an owner', () => {
    expect(resolveRepoParam('site', options)).toEqual({
      selected: null,
      unknown: null,
      ambiguous: { given: 'site', repos: ['adr-eng/site', 'hirobius/site'] },
    });
  });

  it('keeps each of two case-colliding repos selectable by its full name', () => {
    const colliding = repoOptions({
      blocked: [row('adr-eng/site'), row('adr-eng/site'), row('hirobius/Site')],
      queue: [],
      backlog: [],
      prs: [],
    });

    expect(resolveRepoParam('hirobius/Site', colliding).selected?.repo).toBe('hirobius/Site');
    expect(resolveRepoParam('adr-eng/site', colliding).selected?.repo).toBe('adr-eng/site');
    for (const short of ['site', 'Site']) {
      expect(resolveRepoParam(short, colliding)).toEqual({
        selected: null,
        unknown: null,
        ambiguous: { given: short, repos: ['adr-eng/site', 'hirobius/Site'] },
      });
    }
  });
});

describe('filterByRepo', () => {
  const rows = [
    { repo: 'hirobius/ops', number: 1 },
    { repo: 'hirobius/client-alpha', number: 2 },
    { repo: 'hirobius/ops', number: 3 },
  ];

  it('keeps only the selected repo, in the order the lane had them', () => {
    expect(filterByRepo(rows, 'hirobius/ops').map((r) => r.number)).toEqual([1, 3]);
  });

  it('keeps every row when no repo is selected', () => {
    expect(filterByRepo(rows, null)).toEqual(rows);
  });

  it('is empty — not the whole lane — for a repo with nothing in it', () => {
    expect(filterByRepo(rows, 'hirobius/job-hunt')).toEqual([]);
  });
});
