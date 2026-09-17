/**
 * lib/tasks/severity.mjs — the sev axis (ops#317), orthogonal to p0–p3.
 *
 * Priority answers WHEN we get to it; severity answers WHAT HAPPENS if we
 * don't. One dimension could not tell "this could cost us a client or a
 * lawsuit" from "this is a papercut": ops#27 (client PII in public git history,
 * with an unmet disclosure obligation) sat at `p1` for 71 days and surfaced only
 * because a session happened to sweep every needs-human issue by hand.
 *
 * Pure and label-driven, so the two readers — `scripts/check-sev1-visibility.mjs`
 * and the fleet read behind /ops/standing (`lib/tasks/fleet.mjs`) — share one
 * definition of "open sev1" and cannot drift apart.
 */

/**
 * The ladder, most severe first. `means` is also the GitHub label description
 * in ops AND hds — change it here and the labels must be edited to match. The
 * response each rung gets is documented in CLAUDE.md §0, not encoded here.
 */
export const SEVERITY_LADDER = Object.freeze([
  Object.freeze({
    label: 'sev1',
    means: 'Legal exposure, security incident, data loss, or already affecting a real third party',
  }),
  Object.freeze({
    label: 'sev2',
    means: 'Could become sev1; degrades a production surface; breaks a trust signal',
  }),
  Object.freeze({
    label: 'sev3',
    means: 'Contained blast radius',
  }),
]);

const RUNGS = SEVERITY_LADDER.map((r) => r.label);

/**
 * Label names from either shape: the GitHub port returns strings,
 * `gh ... --json labels` returns `{ name }` objects.
 *
 * @param {{ labels?: unknown }} issue
 * @returns {string[]}
 */
function labelNames(issue) {
  const labels = Array.isArray(issue?.labels) ? issue.labels : [];
  return labels
    .map((l) => (typeof l === 'string' ? l : l && typeof l === 'object' ? l.name : null))
    .filter((n) => typeof n === 'string');
}

/**
 * The most severe sev label on an issue, or null when it carries none.
 *
 * @param {{ labels?: unknown }} issue
 * @returns {'sev1' | 'sev2' | 'sev3' | null}
 */
export function severityOf(issue) {
  const names = new Set(labelNames(issue));
  return /** @type {'sev1'|'sev2'|'sev3'|null} */ (RUNGS.find((r) => names.has(r)) ?? null);
}

/**
 * Every OPEN sev1, normalized and ordered by repo then number. An issue with no
 * `state` counts as open — the fleet feed only ever returns open issues.
 *
 * @param {Array<{ repo?: string, number?: number, title?: string, url?: string, state?: string, labels?: unknown }>|unknown} issues
 * @returns {Array<{ repo: string, number: number, title: string, url: string }>}
 */
export function openSev1(issues) {
  if (!Array.isArray(issues)) return [];
  return issues
    .filter(
      (i) =>
        (i.state === undefined || String(i.state).toLowerCase() === 'open') &&
        severityOf(i) === 'sev1',
    )
    .map((i) => ({ repo: i.repo, number: i.number, title: i.title, url: i.url }))
    .sort((a, b) => String(a.repo).localeCompare(String(b.repo)) || a.number - b.number);
}
