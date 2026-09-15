/**
 * tests/api/park-signals.test.ts — ops#298.
 *
 * Fixtures are drawn verbatim from the real ops#44 comment trail (the
 * issue's own worked example: a loop-infrastructure attempt-failure pair,
 * then a genuine park + adr-eng's human recovery correcting the record).
 * No network — comment arrays are hand-copied from `gh api
 * repos/hirobius/ops/issues/44/comments`.
 */
import { describe, it, expect } from 'vitest';
import {
  parseParkComments,
  pairWithRecovery,
  buildHarvestEntries,
  isBotAuthor,
} from '../../lib/ops/park-signals.mjs';

const OPS_44_COMMENTS = [
  {
    id: 4940709418,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-claim ci-29132512863',
    created_at: '2026-07-05T00:01:00Z',
  },
  {
    id: 4940935444,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-claim ci-29133760732',
    created_at: '2026-07-05T00:10:00Z',
  },
  {
    id: 4940937468,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-attempt-failed ci-29133760732 — iteration ended without a pushed branch (claude step outcome: failure)',
    created_at: '2026-07-05T00:11:00Z',
  },
  {
    id: 4941140572,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-claim ci-29134760405',
    created_at: '2026-07-05T01:00:00Z',
  },
  {
    id: 4941142787,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-claim ci-29134767635',
    created_at: '2026-07-05T01:05:00Z',
  },
  {
    id: 4941145004,
    user: { login: 'github-actions[bot]' },
    body: 'ralph-attempt-failed ci-29134767635 — iteration ended without a pushed branch (claude step outcome: failure)',
    created_at: '2026-07-05T01:06:00Z',
  },
  {
    id: 4941145898,
    user: { login: 'github-actions[bot]' },
    body:
      '🅿️ **Ralph parked this issue** — gave up after 2 failed attempt(s) — last: iteration ended without a pushed branch (claude step outcome: failure)\n' +
      '(To retry: fix the cause, then re-add `ralph-ready`.)',
    created_at: '2026-07-05T01:07:00Z',
  },
  {
    id: 4941518522,
    user: { login: 'adr-eng' },
    body:
      '♻️ **Re-queued** — both `ralph-attempt-failed` records above were loop-infrastructure failures ' +
      '(claude-code-action rejecting `push` events / bot actors), not failures of this issue’s work. ' +
      'Fixed in #119/#120; re-adding `ralph-ready` resets the attempt budget per #121.',
    created_at: '2026-07-05T09:00:00Z',
  },
];

describe('parseParkComments', () => {
  it('extracts an attempt-failed marker with its run id and detail', () => {
    const out = parseParkComments(OPS_44_COMMENTS);
    const attempts = out.filter((s) => s.kind === 'attempt-failed');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      runId: 'ci-29133760732',
      reason: 'iteration ended without a pushed branch (claude step outcome: failure)',
      commentId: 4940937468,
    });
  });

  it('extracts the park marker via parseParkedReason (reused, not re-pasted)', () => {
    const out = parseParkComments(OPS_44_COMMENTS);
    const parked = out.filter((s) => s.kind === 'parked');
    expect(parked).toHaveLength(1);
    expect(parked[0].reason).toBe(
      'gave up after 2 failed attempt(s) — last: iteration ended without a pushed branch (claude step outcome: failure)',
    );
    expect(parked[0].runId).toBeNull();
  });

  it('extracts a ralph-blocked marker, keeping detail below the first line', () => {
    const out = parseParkComments([
      {
        id: 1,
        user: { login: 'claude[bot]' },
        body: 'ralph-blocked: needs a human decision\n\nThree options: A, B, C.',
        created_at: '2026-08-01T00:00:00Z',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'blocked',
      reason: 'needs a human decision\n\nThree options: A, B, C.',
    });
  });

  it('ignores ralph-claim comments and anything else that matches no marker', () => {
    const out = parseParkComments(OPS_44_COMMENTS);
    expect(out.every((s) => s.kind !== 'claim')).toBe(true);
    // 2 claims dropped, 1 recovery comment dropped → 2 attempt-failed + 1 parked = 3 signals
    expect(out).toHaveLength(3);
  });

  it('is empty/null-safe', () => {
    expect(parseParkComments([])).toEqual([]);
    expect(parseParkComments(null)).toEqual([]);
    expect(parseParkComments(undefined)).toEqual([]);
    expect(parseParkComments([{ id: 1, body: null }])).toEqual([]);
  });
});

describe('isBotAuthor', () => {
  it('flags [bot]-suffixed logins case-insensitively', () => {
    expect(isBotAuthor('github-actions[bot]')).toBe(true);
    expect(isBotAuthor('claude[bot]')).toBe(true);
    expect(isBotAuthor('Dependabot[Bot]')).toBe(true);
  });
  it('does not flag a human login', () => {
    expect(isBotAuthor('adr-eng')).toBe(false);
  });
  it('is null-safe', () => {
    expect(isBotAuthor(null)).toBe(false);
    expect(isBotAuthor(undefined)).toBe(false);
  });
});

describe('pairWithRecovery', () => {
  it('pairs the park with adr-eng’s next human comment — the ops#44 shape', () => {
    const signals = parseParkComments(OPS_44_COMMENTS);
    const paired = pairWithRecovery(signals, OPS_44_COMMENTS);
    const parked = paired.find((s) => s.kind === 'parked');
    expect(parked.recovery).toMatchObject({
      commentId: 4941518522,
      author: 'adr-eng',
    });
    expect(parked.recovery.body).toContain('loop-infrastructure failures');
  });

  it('does not pair a bot comment (e.g. the next ralph-claim) as recovery', () => {
    const comments = [
      {
        id: 1,
        user: { login: 'github-actions[bot]' },
        body: '🅿️ **Ralph parked this issue** — gave up after 2 failed attempt(s).\n(To retry: fix the cause, then re-add `ralph-ready`.)',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        user: { login: 'github-actions[bot]' },
        body: 'ralph-claim ci-1',
        created_at: '2026-01-02T00:00:00Z',
      },
    ];
    const paired = pairWithRecovery(parseParkComments(comments), comments);
    expect(paired[0].recovery).toBeNull();
  });

  it('leaves attempt-failed signals with recovery: null (not a stopping point)', () => {
    const signals = parseParkComments(OPS_44_COMMENTS);
    const paired = pairWithRecovery(signals, OPS_44_COMMENTS);
    for (const s of paired.filter((x) => x.kind === 'attempt-failed')) {
      expect(s.recovery).toBeNull();
    }
  });

  it('is empty/null-safe', () => {
    expect(pairWithRecovery([], [])).toEqual([]);
    expect(pairWithRecovery(null, null)).toEqual([]);
  });
});

describe('buildHarvestEntries', () => {
  it('emits one entry for the parked+recovery pair, storing the raw text (no distillation)', () => {
    const signals = parseParkComments(OPS_44_COMMENTS);
    const paired = pairWithRecovery(signals, OPS_44_COMMENTS);
    const entries = buildHarvestEntries('ops#44', paired);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'park-harvest',
      evidence_unit_id: 'ops#44',
      applies_to: 'all',
      ts: '2026-07-05T01:07:00Z',
    });
    expect(entries[0].rule).toContain('gave up after 2 failed attempt(s)');
    expect(entries[0].rationale).toContain('loop-infrastructure failures');
  });

  it('drops unresolved park/blocked signals (no recovery yet)', () => {
    const comments = [
      {
        id: 1,
        user: { login: 'github-actions[bot]' },
        body: '🅿️ **Ralph parked this issue** — still stuck.\n(To retry: fix the cause, then re-add `ralph-ready`.)',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const paired = pairWithRecovery(parseParkComments(comments), comments);
    expect(buildHarvestEntries('ops#1', paired)).toEqual([]);
  });

  it('is deterministic across two runs over the same input (the idempotency fingerprint)', () => {
    const signals = parseParkComments(OPS_44_COMMENTS);
    const paired = pairWithRecovery(signals, OPS_44_COMMENTS);
    expect(buildHarvestEntries('ops#44', paired)).toEqual(buildHarvestEntries('ops#44', paired));
  });

  it('is empty-safe', () => {
    expect(buildHarvestEntries('ops#1', [])).toEqual([]);
  });
});
