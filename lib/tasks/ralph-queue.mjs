/**
 * lib/tasks/ralph-queue.mjs — pure, selector-parity ordering for the board's
 * Ralph panel (ops#112).
 *
 * MUST mirror ralph/next.sh:26-32 exactly: eligible = open ralph-ready issues
 * minus blocked/needs-adrian/ralph-parked; order = p0→p3 label then ascending
 * issue number, unlabeled priority last. ralph-wip stays in the queue slot it
 * owns (the claim is the real lock) but is annotated so the UI can mark it as
 * "being worked" — the runs lane shows the live iteration.
 */

const EXCLUDE = new Set(['blocked', 'needs-adrian', 'ralph-parked']);
const PRIO = { p0: 0, p1: 1, p2: 2, p3: 3 };

/**
 * @param {Array<{repo: string, number: number, title: string, url: string, labels: string[]}>} issues
 * @returns {Array<{repo, number, title, url, prio: string|null, wip: boolean}>}
 */
export function orderRalphQueue(issues) {
  return issues
    .filter((i) => !i.labels.some((l) => EXCLUDE.has(l)))
    .map((i) => ({
      repo: i.repo,
      number: i.number,
      title: i.title,
      url: i.url,
      prio: i.labels.find((l) => l in PRIO) ?? null,
      wip: i.labels.includes('ralph-wip'),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}

function rank(i) {
  return i.prio != null ? PRIO[i.prio] : 9;
}
