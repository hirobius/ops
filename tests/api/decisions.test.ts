/**
 * lib/tasks/decisions.mjs — reading `decide_by` off decision-template issues.
 *
 * The contract this locks down (ops#418): a decision issue is detected from
 * its own required fields, not from a label that ordinary work can also
 * carry; a malformed or missing date renders as "no date" rather than
 * crashing or vanishing; and `blocking: Yes` — and anything unreadable — never
 * reads as safe to default.
 */
import { describe, it, expect } from 'vitest';
import {
  DECISION_DUE_SOON_DAYS,
  decisionUrgency,
  parseDecisionMeta,
  sortDecisions,
} from '../../lib/tasks/decisions.mjs';

/** A real decision.yml body, as GitHub's issue-forms renderer produces it. */
function decisionBody({
  decideBy = '2026-10-03',
  blocking = "No — apply the default if I don't respond",
}: { decideBy?: string | null; blocking?: string | null } = {}) {
  return [
    '### The question',
    '',
    'Do we ship it?',
    '',
    '### Options and trade-offs',
    '',
    "**A.** Ship it\n**B.** Don't",
    '',
    '### Default if nobody answers',
    '',
    'A — reversible',
    '',
    // `decideBy: null` means the field is genuinely absent — GitHub's own form
    // still writes the heading for an unanswered optional field, but this
    // template marks it required, so the more honest fixture for "absent" is
    // the heading missing entirely, same as a malformed template.
    ...(decideBy === null ? [] : ['### Decide by (YYYY-MM-DD)', '', decideBy, '']),
    '### Must this block on a real answer?',
    '',
    blocking ?? '_No response_',
  ].join('\n');
}

describe('parseDecisionMeta', () => {
  it('reads a well-formed decision issue', () => {
    const meta = parseDecisionMeta(decisionBody());
    expect(meta).toEqual({
      isDecision: true,
      decideByRaw: '2026-10-03',
      decideBy: '2026-10-03',
      malformedDate: false,
      blocking: false,
    });
  });

  it('reads the irreversible option as blocking', () => {
    const meta = parseDecisionMeta(
      decisionBody({
        blocking: 'Yes — irreversible (money, legal, PII, outward-facing); do not default',
      }),
    );
    expect(meta.blocking).toBe(true);
  });

  it('is not a decision issue without the template’s own required fields', () => {
    const workBody = [
      '## What to build',
      '',
      '- [ ] do the thing',
      '',
      'Decide by next week, whatever that means in prose.',
    ].join('\n');
    expect(parseDecisionMeta(workBody).isDecision).toBe(false);
  });

  it('flags an unparseable decide_by as malformed rather than silently dropping it', () => {
    const meta = parseDecisionMeta(decisionBody({ decideBy: 'sometime next month' }));
    expect(meta.isDecision).toBe(true);
    expect(meta.decideBy).toBeNull();
    expect(meta.malformedDate).toBe(true);
  });

  it('rejects a calendar date that does not exist', () => {
    const meta = parseDecisionMeta(decisionBody({ decideBy: '2026-02-30' }));
    expect(meta.decideBy).toBeNull();
    expect(meta.malformedDate).toBe(true);
  });

  it('reports no decide_by as unparseable, not blank', () => {
    const meta = parseDecisionMeta(decisionBody({ decideBy: null }));
    expect(meta.isDecision).toBe(true);
    expect(meta.decideByRaw).toBeNull();
    expect(meta.decideBy).toBeNull();
    // The field is genuinely absent, not present-but-garbled — malformedDate
    // is specifically "present but unparseable", so this is false, not true.
    expect(meta.malformedDate).toBe(false);
  });

  // The one failure mode ops#418 calls out as the genuinely harmful bug.
  it('fails SAFE: an unreadable blocking answer reads as blocking, never as defaultable', () => {
    expect(parseDecisionMeta(decisionBody({ blocking: 'uh, maybe?' })).blocking).toBe(true);
    expect(parseDecisionMeta(decisionBody({ blocking: '_No response_' })).blocking).toBe(true);
  });

  it('handles an empty or non-string body without throwing', () => {
    expect(parseDecisionMeta('').isDecision).toBe(false);
    expect(parseDecisionMeta(null).isDecision).toBe(false);
    expect(parseDecisionMeta(undefined).isDecision).toBe(false);
  });
});

describe('decisionUrgency', () => {
  const NOW = Date.parse('2026-09-24T12:00:00Z');

  it('is overdue the day after decide_by, whatever the hour', () => {
    expect(decisionUrgency('2026-09-23', NOW).urgency).toBe('overdue');
    expect(decisionUrgency('2026-09-23', NOW).daysUntil).toBe(-1);
  });

  it('boundary: one second behind decide_by is still overdue, one second ahead is not', () => {
    const justBefore = Date.parse('2026-09-24T23:59:59Z'); // still "today" in UTC-day terms
    const justAfterMidnight = Date.parse('2026-09-25T00:00:01Z'); // now "tomorrow"
    expect(decisionUrgency('2026-09-24', justBefore).urgency).not.toBe('overdue');
    expect(decisionUrgency('2026-09-24', justAfterMidnight).urgency).toBe('overdue');
  });

  it('is due-soon within the window, inclusive', () => {
    const dueBy = `2026-09-${24 + DECISION_DUE_SOON_DAYS}`;
    expect(decisionUrgency(dueBy, NOW).urgency).toBe('due-soon');
  });

  it('is scheduled just past the due-soon window', () => {
    const dueBy = `2026-09-${24 + DECISION_DUE_SOON_DAYS + 1}`;
    expect(decisionUrgency(dueBy, NOW).urgency).toBe('scheduled');
  });

  it('is today = due-soon, not overdue', () => {
    expect(decisionUrgency('2026-09-24', NOW).urgency).toBe('due-soon');
    expect(decisionUrgency('2026-09-24', NOW).daysUntil).toBe(0);
  });

  it('renders null or unparseable as no-date rather than crashing', () => {
    expect(decisionUrgency(null, NOW)).toEqual({ urgency: 'no-date', daysUntil: null });
  });
});

describe('sortDecisions', () => {
  const row = (number: number, urgency: string, decideBy: string | null) => ({
    repo: 'hirobius/ops',
    number,
    title: `#${number}`,
    url: '',
    decideBy,
    malformedDate: false,
    blocking: false,
    urgency,
    daysUntil: null,
  });

  it('orders overdue, then due-soon, then scheduled, then no-date last', () => {
    const rows = [
      row(1, 'no-date', null),
      row(2, 'scheduled', '2026-12-01'),
      row(3, 'overdue', '2026-09-01'),
      row(4, 'due-soon', '2026-09-25'),
    ];
    expect(sortDecisions(rows).map((r) => r.number)).toEqual([3, 4, 2, 1]);
  });

  it('breaks a tie within a bucket by the nearer date', () => {
    const rows = [row(1, 'scheduled', '2026-12-10'), row(2, 'scheduled', '2026-11-01')];
    expect(sortDecisions(rows).map((r) => r.number)).toEqual([2, 1]);
  });

  it('does not mutate its input', () => {
    const rows = [row(2, 'scheduled', '2026-12-01'), row(1, 'overdue', '2026-09-01')];
    const copy = [...rows];
    sortDecisions(rows);
    expect(rows).toEqual(copy);
  });
});
