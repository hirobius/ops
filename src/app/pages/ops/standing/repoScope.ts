/**
 * repoScope — the pure half of Standing's repo filter.
 *
 * The fleet sweep lands ~200 open issues from a dozen repos in one pile. This
 * module answers the three questions the filter needs, with no React and no
 * router so every answer is testable on its own:
 *
 *   1. Which repos does the loaded data actually hold, and how much is open in
 *      each? (`repoOptions`)
 *   2. Which of them does a `?repo=` value name — or does it name none, or
 *      more than one? (`resolveRepoParam`)
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

/**
 * The lanes a chip's count is made of. The loop is scoped by repo too (see
 * StandingPage) but holds no open work to count; deploys carry no repo at all.
 */
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
  // repo would make `?repo=site` point at whichever sorted first. Uniqueness is
  // judged the way `resolveRepoParam` matches — ignoring case — or `Site` and
  // `site` would each get a short param that resolves to the same repo.
  const shortUses = new Map<string, number>();
  for (const repo of tally.keys()) {
    const key = shortKey(repo);
    shortUses.set(key, (shortUses.get(key) ?? 0) + 1);
  }

  return [...tally]
    .map(([repo, t]) => ({
      repo,
      param: shortUses.get(shortKey(repo)) === 1 ? shortRepo(repo) : repo,
      issues: t.issues,
      prs: t.prs,
      count: t.issues + t.prs,
    }))
    .sort((a, b) => b.count - a.count || a.param.localeCompare(b.param));
}

/** A short `?repo=` value that more than one loaded repo answers to. */
export interface RepoAmbiguity {
  /** The raw param, as given. */
  given: string;
  /** Full `owner/repo` of every match, in option order. */
  repos: string[];
}

/**
 * At most one of `selected`, `unknown` and `ambiguous` is set; all null means
 * no `?repo=` at all. In both miss cases the page shows every repo and SAYS
 * why — an empty page would read as "nothing is open".
 */
export interface RepoResolution {
  /** The option the param names, or null for every repo. */
  selected: RepoOption | null;
  /**
   * The raw param when it named nothing in the loaded data — a typo, a repo
   * whose last issue closed, a link from another owner.
   */
  unknown: string | null;
  /**
   * The param is a short name two owners share. Kept apart from `unknown`
   * because "nothing open" would be false here — and a saved `?repo=site`
   * lands in this state the day another owner's `site` gets its first issue.
   */
  ambiguous: RepoAmbiguity | null;
}

/**
 * Which option a `?repo=` value names. Matches the option's own param or its
 * full `owner/repo`, case-insensitively — GitHub treats names that way, and a
 * hand-typed link should not miss on capitalisation. A short name that several
 * repos share names none of them: guessing an owner would scope the page to
 * work the operator may not have meant.
 */
export function resolveRepoParam(raw: string | null, options: RepoOption[]): RepoResolution {
  const none = { selected: null, unknown: null, ambiguous: null };
  const given = raw?.trim() ?? '';
  if (!given) return none;
  const wanted = given.toLowerCase();
  const selected =
    options.find((o) => o.param.toLowerCase() === wanted || o.repo.toLowerCase() === wanted) ??
    null;
  if (selected) return { ...none, selected };
  const sharing = options.filter((o) => shortKey(o.repo) === wanted);
  return sharing.length > 1
    ? { ...none, ambiguous: { given, repos: sharing.map((o) => o.repo) } }
    : { ...none, unknown: given };
}

/** The short name as a collision/match key — case-insensitive, like GitHub. */
function shortKey(repo: string): string {
  return shortRepo(repo).toLowerCase();
}

/** The rows of one lane that belong to `repo` (full `owner/repo`), or all of them for null. */
export function filterByRepo<T extends RepoRow>(rows: readonly T[], repo: string | null): T[] {
  return repo === null ? [...rows] : rows.filter((r) => r.repo === repo);
}
