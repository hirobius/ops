/** @internal — ops fleet dashboard support. */
/**
 * freshness — is a repo's `status.json` still describing the repo?
 *
 * ops#417. `/ops` renders each fleet repo's `status.json` as the narrative
 * layer deploys cannot express, and it reads as authoritative. On 2026-09-24
 * hds's was three hours and six commits behind: it described state from 06:40
 * while commits ran through 09:33, recording none of the component reference
 * site, the story-coverage gate, or the one thing blocking the site from going
 * live. The dashboard would have shown that as current.
 *
 * The fleet-hub convention in every repo's CLAUDE.md says update `status.json`
 * before ending a session that changed project state. That is a discipline with
 * no mechanical check behind it, and disciplines without checks decay quietly.
 *
 * This is the cheap, mechanical half: a timestamp comparison. It cannot tell
 * you whether the narrative is TRUE — hds's file also asserted "56 stories
 * already have play() functions" when the real count is zero — but a file
 * nobody has touched since several commits ago is the first visible symptom of
 * one nobody is maintaining.
 *
 * Deliberately pure. The I/O that supplies both timestamps lives in index.mjs;
 * what can be wrong here is the comparison, so that is what is testable.
 */

/**
 * Below this, being behind is unremarkable — a status written minutes before
 * the final push of a session is not a problem worth a badge. At or above it,
 * the narrative and the code have diverged by enough that a reader should not
 * trust the former. The boundary belongs to `stale`: when in doubt, warn.
 */
export const FRESHNESS_RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {'current'|'recent'|'stale'|'unknown'} FreshnessState
 * @typedef {Object} Freshness
 * @property {FreshnessState} state
 * @property {number|null} behindMs     how far status.json trails the last commit, 0 when ahead
 * @property {number|null} behindHours  the same, rounded, for display
 */

/**
 * @param {unknown} statusUpdatedAt  `status.json`'s `updatedAt` — an ISO string by convention,
 *                                   but this is a file humans and agents hand-edit, so treat
 *                                   anything unparseable as unknown rather than guessing.
 * @param {number|null|undefined} latestCommitAt  epoch ms of the repo's most recent commit.
 * @returns {Freshness}
 */
export function deriveStatusFreshness(statusUpdatedAt, latestCommitAt) {
  const unknown = {
    state: /** @type {FreshnessState} */ ('unknown'),
    behindMs: null,
    behindHours: null,
  };

  // A date is only trustworthy from a string here. `new Date(12345)` would
  // happily produce 1970 and read as catastrophically stale, which is a
  // confident wrong answer — the exact thing this exists to prevent.
  if (typeof statusUpdatedAt !== 'string' || !statusUpdatedAt.trim()) return unknown;

  const statusAt = Date.parse(statusUpdatedAt);
  if (Number.isNaN(statusAt)) return unknown;

  if (typeof latestCommitAt !== 'number' || !Number.isFinite(latestCommitAt)) return unknown;

  const behindMs = Math.max(0, latestCommitAt - statusAt);
  const behindHours = Math.round(behindMs / (60 * 60 * 1000));

  if (behindMs === 0) return { state: 'current', behindMs, behindHours };
  if (behindMs < FRESHNESS_RECENT_MS) return { state: 'recent', behindMs, behindHours };
  return { state: 'stale', behindMs, behindHours };
}

/** Human label for a state — one place, so the API and any UI cannot word it differently. */
export function freshnessLabel(freshness) {
  switch (freshness?.state) {
    case 'current':
      return 'current';
    case 'recent':
      return freshness.behindHours >= 1 ? `${freshness.behindHours}h behind` : 'minutes behind';
    case 'stale':
      return `${Math.floor(freshness.behindMs / FRESHNESS_RECENT_MS)}d behind — do not trust the narrative`;
    default:
      return 'unknown';
  }
}
