/**
 * lib/ops/park-signals.mjs — pure parsing of Ralph's park/attempt-failed/
 * blocked comment markers into structured signals (ops#298).
 *
 * `ralph/lib.sh` writes two of these markers unconditionally on every
 * failure (`ralph-attempt-failed`, the 🅿️ park comment); the third is the
 * agent's own explicit stop (`ralph-blocked:`, `ralph/prompt.md` §1). None
 * of this needs a writer of its own — the corpus is already on GitHub, for
 * every repo, since July. `scripts/harvest-park-signals.mjs` is the I/O
 * shell that feeds real GitHub comment arrays through these; everything
 * here is pure and unit-tested against fixtures with no network.
 */

import { parseParkedReason } from '../tasks/ralph-parked.mjs';

const ATTEMPT_FAILED_RE = /^ralph-attempt-failed\s+(\S+)\s+—\s+([\s\S]+)$/;
/** The exact prefix `park_issue()` opens every parking comment with (ralph/lib.sh:293). */
const PARK_COMMENT_PREFIX = '🅿️ **Ralph parked this issue**';
/** The exact marker `ralph/prompt.md` §1 requires as an agent's blocked-stop first line. */
const BLOCKED_PREFIX = 'ralph-blocked:';

/** True for a GitHub bot identity (`login` ending in `[bot]`) — a recovery must come from a human. */
export function isBotAuthor(login) {
  return typeof login === 'string' && /\[bot\]$/i.test(login);
}

function authorOf(comment) {
  return typeof comment.user === 'string' ? comment.user : (comment.user?.login ?? null);
}

/**
 * Extract the three marker shapes out of a raw GitHub issue-comments array
 * (`{ id, user: { login }, body, created_at }`, the shape
 * `GET /repos/:owner/:repo/issues/:number/comments` returns). Comments
 * matching none of the three markers are dropped — this is a filter, not a
 * 1:1 map.
 *
 * @param {Array<{id: number, user?: {login?: string}|string, body: string, created_at?: string}>} comments
 * @returns {Array<{kind: 'attempt-failed'|'parked'|'blocked', reason: string|null, runId: string|null, createdAt: string|null, commentId: number, author: string|null}>}
 */
export function parseParkComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const signals = [];
  for (const c of list) {
    if (!c || typeof c.body !== 'string') continue;
    const body = c.body;
    const base = {
      createdAt: c.created_at ?? c.createdAt ?? null,
      commentId: c.id,
      author: authorOf(c),
    };

    const attemptMatch = ATTEMPT_FAILED_RE.exec(body);
    if (attemptMatch) {
      signals.push({
        kind: 'attempt-failed',
        reason: attemptMatch[2].trim(),
        runId: attemptMatch[1],
        ...base,
      });
      continue;
    }

    if (body.startsWith(PARK_COMMENT_PREFIX)) {
      signals.push({ kind: 'parked', reason: parseParkedReason(body), runId: null, ...base });
      continue;
    }

    if (body.startsWith(BLOCKED_PREFIX)) {
      signals.push({
        kind: 'blocked',
        reason: body.slice(BLOCKED_PREFIX.length).trim(),
        runId: null,
        ...base,
      });
    }
  }
  return signals;
}

function findRecovery(comments, afterCommentId) {
  const idx = comments.findIndex((c) => c && c.id === afterCommentId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < comments.length; i += 1) {
    const c = comments[i];
    if (!c || typeof c.body !== 'string') continue;
    const author = authorOf(c);
    if (!isBotAuthor(author)) {
      return {
        commentId: c.id,
        author,
        body: c.body,
        createdAt: c.created_at ?? c.createdAt ?? null,
      };
    }
  }
  return null;
}

/**
 * Attach the next human (non-bot) comment after each `parked`/`blocked`
 * signal as `.recovery` — "what the loop thought broke" paired with "what a
 * human later said actually happened", the highest-value shape per ops#44's
 * trail (a park comment followed by adr-eng's correction). `attempt-failed`
 * signals pass through unpaired: they're a mid-loop record, not a stopping
 * point a human resolves.
 *
 * Takes the full `comments` array (not just `signals`) because finding
 * "the next comment after this one" requires the surrounding context a
 * filtered signal list has already dropped.
 *
 * @param {ReturnType<typeof parseParkComments>} signals
 * @param {Array<{id: number, user?: {login?: string}|string, body: string, created_at?: string}>} comments
 *   the SAME full comment list `signals` was parsed from (order matters).
 * @returns {Array<ReturnType<typeof parseParkComments>[number] & {recovery: {commentId: number, author: string|null, body: string, createdAt: string|null} | null}>}
 */
export function pairWithRecovery(signals, comments) {
  const list = Array.isArray(comments) ? comments : [];
  const sigs = Array.isArray(signals) ? signals : [];
  return sigs.map((signal) => {
    if (signal.kind !== 'parked' && signal.kind !== 'blocked') return { ...signal, recovery: null };
    return { ...signal, recovery: findRecovery(list, signal.commentId) };
  });
}

/**
 * Turn paired signals into `persistLearnedRule()`-ready entries — only the
 * ones a human actually resolved (`.recovery` present); an unresolved park
 * is nothing to learn from yet. No distillation happens here: per ops#298,
 * "a stochastic LLM-distilled rule should never auto-write to the gate
 * set", and the same caution applies to auto-distilling prose. `rule` and
 * `rationale` carry the raw pair verbatim; `promote-learned-rule.mjs`'s
 * HITL walk is where a human turns this into an imperative rule.
 *
 * `ts` is the park/blocked comment's OWN `createdAt` (not "now"), so the
 * `(evidence_unit_id, ts, rule)` triple is a stable fingerprint: re-running
 * the harvester over the same GitHub history always derives the identical
 * entry, which is what makes a re-run idempotent without persisting a
 * separate dedupe key into the append-only JSONL schema.
 *
 * @param {string} evidenceUnitId short form, e.g. `ops#44`
 * @param {ReturnType<typeof pairWithRecovery>} pairedSignals
 * @returns {Array<{rule: string, rationale: string, applies_to: 'all', source: 'park-harvest', evidence_unit_id: string, ts: string}>}
 */
export function buildHarvestEntries(evidenceUnitId, pairedSignals) {
  const list = Array.isArray(pairedSignals) ? pairedSignals : [];
  return list
    .filter((s) => s && (s.kind === 'parked' || s.kind === 'blocked') && s.recovery)
    .map((s) => ({
      rule: `[${s.kind}] ${s.reason ?? '(no reason captured)'}`,
      rationale: s.recovery.body.trim(),
      applies_to: 'all',
      source: 'park-harvest',
      evidence_unit_id: evidenceUnitId,
      ts: s.createdAt ?? new Date().toISOString(),
    }));
}
