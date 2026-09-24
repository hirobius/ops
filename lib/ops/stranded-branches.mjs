/**
 * lib/ops/stranded-branches.mjs — pure decision logic for
 * scripts/audit-stranded-branches.mjs (ops#407).
 *
 * No network, no git: takes an already-gathered "world" snapshot (per-repo
 * default branch + per-branch PR/compare facts) and classifies which
 * branches are stranded — pushed, never opened a PR in any state, and not
 * one of the two expected exceptions (a `ralph/claim-*` marker, or a
 * deliberately archived `archive/*` subtree).
 *
 * Same split as branch-ancestry.mjs / ralph-watchdog.mjs: this half is pure
 * and every edge case tests with no network and no fake timers; the I/O half
 * (scripts/audit-stranded-branches.mjs) gathers the world from the GitHub
 * API, or — in --fixture-mode — reads it straight from a JSON fixture.
 */

/** Branches these patterns match are expected to have no PR — never reported. */
export const EXCLUDE_PATTERNS = [/^ralph\/claim-/, /^archive\//];

const ISSUE_BRANCH_RE = /^claude\/issue-(\d+)-/;

/** True when `name` matches one of the expected no-PR classes. */
export function isExcludedBranch(name) {
  return EXCLUDE_PATTERNS.some((re) => re.test(name));
}

/** The issue number encoded in a `claude/issue-<N>-*` branch name, or null. */
export function parseIssueNumber(name) {
  const m = ISSUE_BRANCH_RE.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * @typedef {Object} BranchFact
 * @property {string} name
 * @property {boolean} hasPr        Has a PR ever existed for this branch (any state)?
 * @property {number|null} [aheadBy]        Commits ahead of the default branch.
 * @property {'ahead'|'behind'|'diverged'|'identical'|null} [compareStatus]
 * @property {string|null} [lastCommitDate] ISO date of the branch tip.
 *
 * @typedef {Object} RepoWorld
 * @property {string} repo
 * @property {string} defaultBranch  As reported by the API — never assumed.
 * @property {BranchFact[]} branches
 */

/**
 * @param {RepoWorld} repoWorld
 * @returns {Array<{repo:string, branch:string, issueNumber:number|null, commitsAhead:number|null, lastCommitDate:string|null, mergesCleanly:boolean|null}>}
 */
export function findStrandedBranches(repoWorld) {
  const { repo, defaultBranch, branches } = repoWorld;
  return branches
    .filter((b) => b.name !== defaultBranch && !isExcludedBranch(b.name) && b.hasPr === false)
    .map((b) => ({
      repo,
      branch: b.name,
      issueNumber: parseIssueNumber(b.name),
      commitsAhead: typeof b.aheadBy === 'number' ? b.aheadBy : null,
      lastCommitDate: b.lastCommitDate ?? null,
      // A pure fast-forward of the default branch ('ahead' — the default
      // branch has 0 commits the branch lacks) is guaranteed conflict-free.
      // 'diverged' MIGHT still merge cleanly (non-overlapping files), but the
      // only way GitHub answers that for real is opening a PR — explicitly
      // out of scope here (see module header) — so diverged is reported as
      // unknown, never asserted either way.
      mergesCleanly: b.compareStatus === 'ahead' || b.compareStatus === 'identical' ? true : null,
    }));
}

/**
 * @param {{repos: RepoWorld[]}} world
 * @returns {{perRepo: Array<{repo:string, defaultBranch:string, stranded: object[]}>, stranded: object[], issuesWithStrandedBranch: number[]}}
 */
export function auditWorld(world) {
  const perRepo = (world?.repos ?? []).map((r) => ({
    repo: r.repo,
    defaultBranch: r.defaultBranch,
    stranded: findStrandedBranches(r),
  }));
  const stranded = perRepo.flatMap((r) => r.stranded);
  const issuesWithStrandedBranch = [
    ...new Set(stranded.map((s) => s.issueNumber).filter((n) => n !== null)),
  ].sort((a, b) => a - b);
  return { perRepo, stranded, issuesWithStrandedBranch };
}

/** Canonical-shape violations (severity `warn` — this is a reporting gate). */
export function buildViolations(auditResult) {
  return auditResult.stranded.map((s) => {
    const bits = [`${s.repo}:${s.branch} has never had a PR in any state`];
    if (s.issueNumber !== null) bits.push(`issue #${s.issueNumber}`);
    if (s.commitsAhead !== null) bits.push(`${s.commitsAhead} commit(s) ahead`);
    if (s.lastCommitDate) bits.push(`last commit ${s.lastCommitDate}`);
    bits.push(
      s.mergesCleanly === true
        ? 'merges cleanly'
        : 'merge cleanliness unknown (diverged from the default branch)',
    );
    return {
      file: '*',
      line: null,
      rule: 'STRANDED_BRANCH_NO_PR',
      severity: 'warn',
      message: bits.join(' — '),
      repo: s.repo,
      branch: s.branch,
      issueNumber: s.issueNumber,
      commitsAhead: s.commitsAhead,
      lastCommitDate: s.lastCommitDate,
      mergesCleanly: s.mergesCleanly,
    };
  });
}
