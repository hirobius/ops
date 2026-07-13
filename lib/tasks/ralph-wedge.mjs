/**
 * lib/tasks/ralph-wedge.mjs — pure wedge classification for the fleet panel's
 * open-Ralph-PRs lane (ops#141, extends #112).
 *
 * Mirrors `ralph/lib.sh`'s `classify_wedged()` verbatim (lib.sh:106-121): a
 * PR is wedged when its latest `ralph-gate` commit status is `failure`, or
 * when the gate has never reported (`none`) or is still `pending` after ≥3h
 * open — never for a healthy in-flight run.
 */

const STALE_HOURS = 3;

/**
 * @param {{ gate: 'failure'|'pending'|'none'|'success'|string, ageHours: number }} input
 * @returns {{ wedged: boolean, reason: string | null }}
 */
export function classifyWedged({ gate, ageHours }) {
  if (gate === 'failure') {
    return {
      wedged: true,
      reason: 'ralph-gate FAILED (changes requested / red gate); needs a human.',
    };
  }
  if ((gate === 'none' || gate === 'pending') && ageHours >= STALE_HOURS) {
    return {
      wedged: true,
      reason: `open ${Math.floor(ageHours)}h with no passing ralph-gate (stale / never gated).`,
    };
  }
  return { wedged: false, reason: null };
}
