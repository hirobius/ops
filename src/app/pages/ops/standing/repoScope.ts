/**
 * repoScope — the pure half of Standing's repo filter.
 *
 * The fleet sweep lands ~200 open issues from a dozen repos in one pile. This
 * module answers the three questions the filter needs, with no React and no
 * router so every answer is testable on its own:
 *
 *   1. Which repos does the loaded data actually hold, and how much is open in
 *      each? (`repoOptions`)
 *   2. Which of them does a `?repo=` value name — or does it name none?
 *      (`resolveRepoParam`)
 *   3. Which rows survive the filter? (`filterByRepo`)
 *
 * The option set is DERIVED from the rows, never configured — same rule as the
 * page's repo set. A filter listing a repo with nothing open would be a second
 * list to keep in sync with GitHub, so there isn't one.
 */

import { shortRepo } from '../ralphStatus';

/** Anything with a `owner/repo` — every issue and PR row on the page. */
interface RepoRow {
  repo: string;
}

/** The lanes a repo filter scopes. The loop and deploys are not repo lanes. */
export interface RepoLanes {
  blocked: readonly RepoRow[];
  queue: readonly RepoRow[];
  backlog: readonly RepoRow[];
  prs: readonly RepoRow[];
}

export interface RepoOption {
  /** Full `owner/repo`, the key rows are matched on. */
  repo: string;
  /** What the chip shows and `?repo=` carries. */
  param: string;
  /** Open issues across the blocked, queue and backlog lanes. */
  issues: number;
  prs: number;
  /** issues + prs — exactly what the lanes add up to with this repo selected. */
  count: number;
}

/**
 * One option per repo present in the lanes, busiest first, then by name.
 *
 * The count is issues AND PRs because that is what selecting the repo reveals:
 * the lane headers under a selected chip always sum to the chip's number.
 */
export function repoOptions(lanes: RepoLanes): RepoOption[] {
  const tally = new Map<string, { issues: number; prs: number }>();
  const bump = (repo: string, key: 'issues' | 'prs') => {
    const t = tally.get(repo) ?? { issues: 0, prs: 0 };
    t[key] += 1;
    tally.set(repo, t);
  };
  for (const r of [...lanes.blocked, ...lanes.queue, ...lanes.backlog]) bump(r.repo, 'issues');
  for (const r of lanes.prs) bump(r.repo, 'prs');

  // A short name is only a name while it is unique. Two owners with a `site`
  // repo would make `?repo=site` point at whichever sorted first.
  const shortUses = new Map<string, number>();
  for (const repo of tally.keys()) {
    shortUses.set(shortRepo(repo), (shortUses.get(shortRepo(repo)) ?? 0) + 1);
  }

  return [...tally]
    .map(([repo, t]) => ({
      repo,
      param: shortUses.get(shortRepo(repo)) === 1 ? shortRepo(repo) : repo,
      issues: t.issues,
      prs: t.prs,
      count: t.issues + t.prs,
    }))
    .sort((a, b) => b.count - a.count || a.param.localeCompare(b.param));
}

export interface RepoResolution {
  /** The option the param names, or null for every repo. */
  selected: RepoOption | null;
  /**
   * The raw param when it named nothing in the loaded data — a typo, a repo
   * whose last issue closed, a link from another owner. The page falls back to
   * every repo and SAYS so; an empty page would read as "nothing is open".
   */
  unknown: string | null;
}

/**
 * Which option a `?repo=` value names. Matches the option's own param or its
 * full `owner/repo`, case-insensitively — GitHub treats names that way, and a
 * hand-typed link should not miss on capitalisation.
 */
export function resolveRepoParam(raw: string | null, options: RepoOption[]): RepoResolution {
  const given = raw?.trim() ?? '';
  if (!given) return { selected: null, unknown: null };
  const wanted = given.toLowerCase();
  const selected =
    options.find((o) => o.param.toLowerCase() === wanted || o.repo.toLowerCase() === wanted) ??
    null;
  return selected ? { selected, unknown: null } : { selected: null, unknown: given };
}

/** The rows of one lane that belong to `repo` (full `owner/repo`), or all of them for null. */
export function filterByRepo<T extends RepoRow>(rows: readonly T[], repo: string | null): T[] {
  return repo === null ? [...rows] : rows.filter((r) => r.repo === repo);
}
