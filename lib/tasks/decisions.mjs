/**
 * lib/tasks/decisions.mjs — reads `decide_by` off decision-template issues (ops#418).
 *
 * `.github/ISSUE_TEMPLATE/decision.yml` promises "with a default and a date,
 * silence becomes a decision instead" — but nothing read the date back. This
 * is the pure half: given an issue body, say whether it is a decision issue,
 * what its `decide_by` is, and whether it is flagged irreversible ("blocking").
 * The I/O (which body text to hand it) lives in `lib/github/issues.mjs`, next
 * to the only other place a raw issue body is read — bodies are otherwise
 * dropped before the fleet sweep leaves the server.
 *
 * Deliberately pure and network-free so the boundary is testable without a
 * token: a fixture body in, a verdict out.
 */

/**
 * GitHub issue-forms renders each field as `### <label>\n\n<answer>`. Pull the
 * text under one heading, up to the next `###` or the end of the body.
 * @param {string} body
 * @param {string} header
 * @returns {string|null}
 */
function fieldValue(body, header) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`###\\s*${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const m = re.exec(body);
  const value = m ? m[1].trim() : null;
  return value ? value : null;
}

/**
 * @typedef {Object} DecisionMeta
 * @property {boolean} isDecision   carries every required field the template writes
 * @property {string|null} decideByRaw  the field's raw text, whatever it says
 * @property {string|null} decideBy     a `YYYY-MM-DD` prefix pulled out of it, or null
 * @property {boolean} malformedDate    isDecision, and the field is present but unparseable
 * @property {boolean} blocking     Anything other than the template's exact
 *   "No — apply the default…" wording. Fails SAFE: an unreadable, garbled or
 *   missing answer counts as blocking, never as safe-to-default.
 */

/**
 * @param {string|null|undefined} body
 * @returns {DecisionMeta}
 */
export function parseDecisionMeta(body) {
  const text = typeof body === 'string' ? body : '';

  // Both are required fields unique to the Decision template (decision.yml) —
  // an ordinary Work issue never carries either heading. Detecting the
  // template from its own required fields means a relabelled or re-titled
  // issue is still read correctly, and a Work issue that merely mentions
  // "decide by" in prose is not misread as one.
  const defaultField = fieldValue(text, 'Default if nobody answers');
  const blockingField = fieldValue(text, 'Must this block on a real answer?');
  const isDecision = defaultField !== null && blockingField !== null;

  if (!isDecision) {
    return {
      isDecision: false,
      decideByRaw: null,
      decideBy: null,
      malformedDate: false,
      blocking: false,
    };
  }

  const decideByRaw = fieldValue(text, 'Decide by (YYYY-MM-DD)');
  const dateMatch = decideByRaw ? /^(\d{4})-(\d{2})-(\d{2})/.exec(decideByRaw) : null;
  const decideBy = dateMatch && isValidCalendarDate(dateMatch) ? dateMatch[0] : null;
  const malformedDate = decideByRaw !== null && decideBy === null;

  // Fails safe: only the template's own explicit "No — apply the default…"
  // reads as safe to default. A missing, garbled, or otherwise unrecognised
  // answer — including the dropdown's own "Yes" wording, which does not START
  // with "No" either — is treated as blocking. Irreversible choices must
  // never be presented as defaultable, and a parse miss is the one failure
  // mode this cannot afford to get backwards (ops#418 DoD).
  const blocking = blockingField === null ? true : !/^no\b/i.test(blockingField.trim());

  return { isDecision, decideByRaw, decideBy, malformedDate, blocking };
}

/** Rejects `2026-02-30` etc. — `Date.parse` alone accepts those and rolls forward. */
function isValidCalendarDate([, y, mo, d]) {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** Below this, "due soon" earns the loud treatment; at or beyond it, "scheduled" is enough. */
export const DECISION_DUE_SOON_DAYS = 3;

/**
 * @typedef {'overdue'|'due-soon'|'scheduled'|'no-date'} DecisionUrgency
 */

/**
 * @param {string|null} decideBy  a `YYYY-MM-DD` string, or null
 * @param {number} [now] epoch ms, injectable for tests
 * @returns {{ urgency: DecisionUrgency, daysUntil: number|null }}
 */
export function decisionUrgency(decideBy, now = Date.now()) {
  if (!decideBy) return { urgency: 'no-date', daysUntil: null };
  // Compare at day granularity in UTC — `decide_by` is a date, not an instant,
  // and comparing raw epoch ms would call a decision "overdue" hours before
  // its actual day ends depending on when `now` happens to land.
  const dueMs = Date.parse(`${decideBy}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return { urgency: 'no-date', daysUntil: null };
  const todayMs = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  const daysUntil = Math.round((dueMs - todayMs) / 86_400_000);
  if (daysUntil < 0) return { urgency: 'overdue', daysUntil };
  if (daysUntil <= DECISION_DUE_SOON_DAYS) return { urgency: 'due-soon', daysUntil };
  return { urgency: 'scheduled', daysUntil };
}

const URGENCY_RANK = { overdue: 0, 'due-soon': 1, scheduled: 2, 'no-date': 3 };

/**
 * Nearest date first — overdue, then due-soon, then scheduled by date, then
 * "no date" (a template violation) last, since it has no date to sort by.
 * @param {Array<{ decideBy: string|null, urgency: DecisionUrgency, number: number }>} rows
 */
export function sortDecisions(rows) {
  return [...rows].sort((a, b) => {
    const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rank !== 0) return rank;
    if (a.decideBy && b.decideBy && a.decideBy !== b.decideBy) {
      return a.decideBy < b.decideBy ? -1 : 1;
    }
    return a.number - b.number;
  });
}
