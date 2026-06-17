/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Unit tests for scripts/validate-orchestration.mjs
 *
 * `validateUnit` is a pure function — tests construct minimal inline
 * fixtures so they don't depend on the real orchestration.json (which
 * changes frequently and is too large for snapshot diffing).
 *
 * Each rule gets one positive test (valid input → no error with that code)
 * and one negative test (invalid input → error with expected code).
 *
 * Rules covered:
 *   1. BAD_APPROVAL            (line 104–109 of validate-orchestration.mjs)
 *   2. BAD_PRIORITY            (line 80–85)
 *   3. BAD_SPRINT              (line 87–94)
 *   4. BAD_STATUS              (line 112–119) — severity: 'warn', present in failures
 *   5. MISSING_CLAIMED_BY      (line 122–126)
 *   6. BAD_CLAIMED_AT          (line 128–133) — covers missing + malformed
 *   7. ORPHAN_CLAIM_FIELDS     (line 136–144)
 *   8. Positive sanity         — fully valid unit passes with zero errors
 */

import { describe, it, expect } from 'vitest';
import { validateUnit } from '../validate-orchestration.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid unit that passes all rules. */
function validUnit(overrides = {}) {
  return {
    id: 'test-unit-001',
    priority: 3,
    sprint: 2,
    cluster: 'test-cluster',
    approval: 'proposed',
    status: 'proposed',
    ...overrides,
  };
}

function codesIn(failures) {
  return failures.map((f) => f.code);
}

// ---------------------------------------------------------------------------
// 8. Positive sanity — fully valid unit produces no failures
// ---------------------------------------------------------------------------

describe('positive sanity', () => {
  it('a fully valid proposed unit returns an empty failures array', () => {
    const failures = validateUnit(validUnit());
    expect(failures).toEqual([]);
  });

  it('a fully valid claimed unit with claimedBy + claimedAt returns no failures', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-session-001',
        claimedAt: '2026-05-01T12:00:00.000Z',
      }),
    );
    expect(failures).toEqual([]);
  });

  it('a done unit does not require claimedBy/claimedAt but may keep them', () => {
    const failures = validateUnit(
      validUnit({
        status: 'done',
        approval: 'approved',
        claimedBy: 'session:old-agent',
        claimedAt: '2026-04-30T10:00:00.000Z',
      }),
    );
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1. BAD_APPROVAL (validate-orchestration.mjs line 104–109)
// ---------------------------------------------------------------------------

describe('BAD_APPROVAL', () => {
  it('positive: valid approval value "proposed" produces no BAD_APPROVAL error', () => {
    const failures = validateUnit(validUnit({ approval: 'proposed' }));
    expect(codesIn(failures)).not.toContain('BAD_APPROVAL');
  });

  it('negative: "pending" approval emits BAD_APPROVAL', () => {
    const failures = validateUnit(validUnit({ approval: 'pending' }));
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('BAD_APPROVAL');
  });

  it('negative: "accepted" approval emits BAD_APPROVAL', () => {
    const failures = validateUnit(validUnit({ approval: 'accepted' }));
    expect(codesIn(failures)).toContain('BAD_APPROVAL');
  });

  it('negative: numeric approval emits MISSING_APPROVAL (typeof check precedes BAD_APPROVAL)', () => {
    const failures = validateUnit(validUnit({ approval: 1 }));
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('MISSING_APPROVAL');
  });
});

// ---------------------------------------------------------------------------
// 2. BAD_PRIORITY (validate-orchestration.mjs line 80–85)
// ---------------------------------------------------------------------------

describe('BAD_PRIORITY', () => {
  it('positive: priority 1 (min boundary) produces no BAD_PRIORITY error', () => {
    const failures = validateUnit(validUnit({ priority: 1 }));
    expect(codesIn(failures)).not.toContain('BAD_PRIORITY');
  });

  it('positive: priority 5 (max boundary) produces no BAD_PRIORITY error', () => {
    const failures = validateUnit(validUnit({ priority: 5 }));
    expect(codesIn(failures)).not.toContain('BAD_PRIORITY');
  });

  it('negative: priority 0 (out-of-range low) emits BAD_PRIORITY', () => {
    const failures = validateUnit(validUnit({ priority: 0 }));
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('BAD_PRIORITY');
  });

  it('negative: priority 6 (out-of-range high) emits BAD_PRIORITY', () => {
    const failures = validateUnit(validUnit({ priority: 6 }));
    expect(codesIn(failures)).toContain('BAD_PRIORITY');
  });

  it('negative: priority 2.5 (non-integer) emits BAD_PRIORITY', () => {
    const failures = validateUnit(validUnit({ priority: 2.5 }));
    expect(codesIn(failures)).toContain('BAD_PRIORITY');
  });
});

// ---------------------------------------------------------------------------
// 3. BAD_SPRINT (validate-orchestration.mjs line 87–94)
// ---------------------------------------------------------------------------

describe('BAD_SPRINT', () => {
  it('positive: sprint 0 (min boundary) produces no BAD_SPRINT error', () => {
    const failures = validateUnit(validUnit({ sprint: 0 }));
    expect(codesIn(failures)).not.toContain('BAD_SPRINT');
  });

  it('positive: sprint 6 (max boundary) produces no BAD_SPRINT error', () => {
    const failures = validateUnit(validUnit({ sprint: 6 }));
    expect(codesIn(failures)).not.toContain('BAD_SPRINT');
  });

  it('negative: sprint -1 (out-of-range low) emits BAD_SPRINT', () => {
    const failures = validateUnit(validUnit({ sprint: -1 }));
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('BAD_SPRINT');
  });

  it('negative: sprint 7 (out-of-range high) emits BAD_SPRINT', () => {
    const failures = validateUnit(validUnit({ sprint: 7 }));
    expect(codesIn(failures)).toContain('BAD_SPRINT');
  });

  it('negative: sprint 1.5 (non-integer) emits BAD_SPRINT', () => {
    const failures = validateUnit(validUnit({ sprint: 1.5 }));
    expect(codesIn(failures)).toContain('BAD_SPRINT');
  });
});

// ---------------------------------------------------------------------------
// 4. BAD_STATUS (validate-orchestration.mjs line 112–119)
//    NOTE: severity: 'warn' — present in the failures array returned by
//    validateUnit, but the CLI marks it non-blocking. Tests assert on the
//    raw validateUnit return, which includes warn-level entries.
// ---------------------------------------------------------------------------

describe('BAD_STATUS', () => {
  it('positive: status "proposed" produces no BAD_STATUS error', () => {
    const failures = validateUnit(validUnit({ status: 'proposed' }));
    expect(codesIn(failures)).not.toContain('BAD_STATUS');
  });

  it('positive: status "approved" produces no BAD_STATUS error', () => {
    const failures = validateUnit(validUnit({ status: 'approved' }));
    expect(codesIn(failures)).not.toContain('BAD_STATUS');
  });

  it('positive: status "parked" produces no BAD_STATUS error', () => {
    const failures = validateUnit(validUnit({ status: 'parked' }));
    expect(codesIn(failures)).not.toContain('BAD_STATUS');
  });

  it('negative: status "in-progress" emits BAD_STATUS (warn-level)', () => {
    const failures = validateUnit(validUnit({ status: 'in-progress' }));
    expect(failures.length).toBeGreaterThan(0);
    const badStatus = failures.find((f) => f.code === 'BAD_STATUS');
    expect(badStatus).toBeDefined();
    // Confirm it is warn-level (non-blocking in CLI)
    expect(badStatus.severity).toBe('warn');
  });

  it('negative: status "pending" emits BAD_STATUS (warn-level)', () => {
    const failures = validateUnit(validUnit({ status: 'pending' }));
    const badStatus = failures.find((f) => f.code === 'BAD_STATUS');
    expect(badStatus).toBeDefined();
    expect(badStatus.severity).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// 5. MISSING_CLAIMED_BY (validate-orchestration.mjs line 122–126)
// ---------------------------------------------------------------------------

describe('MISSING_CLAIMED_BY', () => {
  it('positive: status=claimed with claimedBy set produces no MISSING_CLAIMED_BY', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-001',
        claimedAt: '2026-05-01T12:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).not.toContain('MISSING_CLAIMED_BY');
  });

  it('negative: status=claimed without claimedBy emits MISSING_CLAIMED_BY', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        // no claimedBy
        claimedAt: '2026-05-01T12:00:00.000Z',
      }),
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('MISSING_CLAIMED_BY');
  });

  it('negative: status=claimed with whitespace-only claimedBy emits MISSING_CLAIMED_BY', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: '   ',
        claimedAt: '2026-05-01T12:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).toContain('MISSING_CLAIMED_BY');
  });
});

// ---------------------------------------------------------------------------
// 6. BAD_CLAIMED_AT (validate-orchestration.mjs line 128–133)
//    Covers both "missing claimedAt" (undefined → typeof !== 'string') and
//    "malformed ISO 8601" (Date.parse returns NaN).
// ---------------------------------------------------------------------------

describe('BAD_CLAIMED_AT', () => {
  it('positive: valid ISO 8601 claimedAt produces no BAD_CLAIMED_AT', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-001',
        claimedAt: '2026-05-01T12:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).not.toContain('BAD_CLAIMED_AT');
  });

  it('negative: status=claimed with no claimedAt emits BAD_CLAIMED_AT', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-001',
        // no claimedAt
      }),
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('BAD_CLAIMED_AT');
  });

  it('negative: malformed timestamp string emits BAD_CLAIMED_AT', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-001',
        claimedAt: 'not-a-date',
      }),
    );
    expect(codesIn(failures)).toContain('BAD_CLAIMED_AT');
  });

  it('negative: numeric claimedAt (epoch ms) emits BAD_CLAIMED_AT', () => {
    const failures = validateUnit(
      validUnit({
        status: 'claimed',
        approval: 'approved',
        claimedBy: 'session:test-001',
        claimedAt: 1746096000000, // epoch ms — not a string
      }),
    );
    expect(codesIn(failures)).toContain('BAD_CLAIMED_AT');
  });
});

// ---------------------------------------------------------------------------
// 7. ORPHAN_CLAIM_FIELDS (validate-orchestration.mjs line 136–144)
//    claimedBy/claimedAt set on a status that is not "claimed" or "done".
// ---------------------------------------------------------------------------

describe('ORPHAN_CLAIM_FIELDS', () => {
  it('positive: status=done with claimedBy + claimedAt is allowed (audit trail)', () => {
    const failures = validateUnit(
      validUnit({
        status: 'done',
        approval: 'approved',
        claimedBy: 'session:old-agent',
        claimedAt: '2026-04-30T09:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).not.toContain('ORPHAN_CLAIM_FIELDS');
  });

  it('negative: status=proposed with claimedBy set emits ORPHAN_CLAIM_FIELDS', () => {
    const failures = validateUnit(
      validUnit({
        status: 'proposed',
        claimedBy: 'session:stale-agent',
      }),
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(codesIn(failures)).toContain('ORPHAN_CLAIM_FIELDS');
  });

  it('negative: status=approved with claimedAt set emits ORPHAN_CLAIM_FIELDS', () => {
    const failures = validateUnit(
      validUnit({
        status: 'approved',
        approval: 'approved',
        claimedAt: '2026-05-01T10:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).toContain('ORPHAN_CLAIM_FIELDS');
  });

  it('negative: status=parked with both claim fields emits ORPHAN_CLAIM_FIELDS', () => {
    const failures = validateUnit(
      validUnit({
        status: 'parked',
        claimedBy: 'session:stale-agent',
        claimedAt: '2026-05-01T10:00:00.000Z',
      }),
    );
    expect(codesIn(failures)).toContain('ORPHAN_CLAIM_FIELDS');
  });
});
