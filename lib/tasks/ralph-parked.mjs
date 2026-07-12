/**
 * lib/tasks/ralph-parked.mjs — pure helpers for the panel's parked inbox
 * (ops#141).
 *
 * parseParkedReason mirrors the exact comment park_issue writes
 * (ralph/lib.sh:281-295): `🅿️ **Ralph parked this issue** — <reason>` followed
 * by a `(To retry: ...)` footer line. hasDodMarker mirrors the intake
 * filter's own check (ralph/next.sh:46-48) — the panel's "add a DoD
 * checklist" hint has to agree with what re-queuing will actually do, or a
 * re-queue just bounces the issue straight back to needs-adrian.
 */

const PARKED_PREFIX = '🅿️ **Ralph parked this issue** — ';
const RETRY_FOOTER = '\n(To retry';

/**
 * Extracts the human-readable reason out of a 🅿️ park comment body, or null
 * if the comment isn't in that format.
 * @param {unknown} commentBody
 * @returns {string | null}
 */
export function parseParkedReason(commentBody) {
  if (typeof commentBody !== 'string' || !commentBody.startsWith(PARKED_PREFIX)) return null;
  const rest = commentBody.slice(PARKED_PREFIX.length);
  const footerIdx = rest.indexOf(RETRY_FOOTER);
  return (footerIdx === -1 ? rest : rest.slice(0, footerIdx)).trim();
}

/** Same regex as ralph/next.sh's has_dod_marker, ported verbatim. */
const DOD_MARKER = /- \[ \]|acceptance|definition of done|\bDoD\b/i;

/**
 * Whether an issue body carries the acceptance-criteria/DoD marker the
 * intake filter requires before it'll work an issue.
 * @param {unknown} body
 * @returns {boolean}
 */
export function hasDodMarker(body) {
  return typeof body === 'string' && DOD_MARKER.test(body);
}
