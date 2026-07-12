/**
 * lib/tasks/ralph-wedge.mjs — pure port of ralph/lib.sh:111-127's
 * classify_wedged (ops#141), so the status panel can badge the same wedged
 * PRs the loop itself alerts Discord about.
 */

const WEDGE_AGE_HOURS = 3;

/**
 * @param {{ gate: string, updatedAt: string }} input `gate` is the latest
 *   `ralph-gate` combined-status state ('success'|'failure'|'pending'|'none'),
 *   `updatedAt` is the PR's ISO `updated_at`.
 * @param {number} nowMs
 * @returns {{ wedged: boolean, reason: string | null }}
 */
export function classifyWedged({ gate, updatedAt }, nowMs) {
  if (gate === 'failure') {
    return { wedged: true, reason: 'ralph-gate FAILED — needs a human.' };
  }
  const ageHours = (nowMs - new Date(updatedAt).getTime()) / 3_600_000;
  if ((gate === 'none' || gate === 'pending') && ageHours >= WEDGE_AGE_HOURS) {
    return {
      wedged: true,
      reason: `open ${Math.floor(ageHours)}h with no passing ralph-gate.`,
    };
  }
  return { wedged: false, reason: null };
}
