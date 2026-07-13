/**
 * lib/tasks/ralph-parked.mjs — pure reason/DoD parsing for the fleet panel's
 * parked inbox lane (ops#141, extends #112).
 *
 * Both fns mirror ralph's own bash verbatim so the loop's parking behavior
 * and this panel's read of it can never drift apart.
 */

/** Matches the exact comment shape `park_issue()` posts (ralph/lib.sh:281-293). */
const PARK_COMMENT_RE = /^🅿️ \*\*Ralph parked this issue\*\* — ([\s\S]*?)\n\(To retry:/;

/**
 * Extracts the human-written reason out of a `park_issue()` comment body.
 * Returns null when `commentBody` doesn't match that shape — e.g. no park
 * comment exists yet (the label was added by hand instead of by the loop).
 * @param {string | null | undefined} commentBody
 * @returns {string | null}
 */
export function parseParkedReason(commentBody) {
  if (typeof commentBody !== 'string') return null;
  const m = PARK_COMMENT_RE.exec(commentBody);
  return m ? m[1].trim() : null;
}

/** Ports `ralph/next.sh`'s `has_dod_marker()` regex verbatim (next.sh:46-47). */
const DOD_RE = /- \[ \]|acceptance|definition of done|\bDoD\b/i;

/**
 * True when an issue body carries an acceptance-criteria/DoD marker — the
 * same check `ralph/next.sh` runs before ever queueing an issue. A
 * `needs-adrian` row whose body still fails this check would just get
 * re-parked by the intake filter the moment it's re-queued.
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
export function hasDodMarker(body) {
  return typeof body === 'string' && DOD_RE.test(body);
}
