/**
 * lib/tasks/ralph-parked.mjs — reason/DoD parsing MUST mirror ralph/lib.sh's
 * park_issue() comment shape and ralph/next.sh's has_dod_marker() regex
 * verbatim, or the panel's parked lane silently drifts from the loop.
 */
import { describe, it, expect } from 'vitest';
import { parseParkedReason, hasDodMarker } from '../../lib/tasks/ralph-parked.mjs';

describe('parseParkedReason', () => {
  it('extracts the reason out of a real park_issue() comment', () => {
    const body =
      '🅿️ **Ralph parked this issue** — hit the attempt cap (2/2 failed attempts — see the ralph-attempt-failed comments above).\n' +
      '(To retry: fix the cause, then re-add `ralph-ready`.)';
    expect(parseParkedReason(body)).toBe(
      'hit the attempt cap (2/2 failed attempts — see the ralph-attempt-failed comments above).',
    );
  });

  it('extracts a needs-adrian DoD reason with parens in the text', () => {
    const body =
      '🅿️ **Ralph parked this issue** — no acceptance criteria found in the body (looked for a `- [ ]` checklist or an acceptance / DoD / definition-of-done section). Add one, then re-add `ralph-ready`.\n' +
      '(To retry: fix the cause, then re-add `ralph-ready`.)';
    expect(parseParkedReason(body)).toContain('no acceptance criteria found');
  });

  it('returns null for a comment that is not a park comment', () => {
    expect(parseParkedReason('just a regular comment')).toBeNull();
  });

  it('returns null for non-string / missing input', () => {
    expect(parseParkedReason(null)).toBeNull();
    expect(parseParkedReason(undefined)).toBeNull();
  });
});

describe('hasDodMarker', () => {
  it('matches a `- [ ]` checklist', () => {
    expect(hasDodMarker('## DoD\n- [ ] thing one\n- [ ] thing two')).toBe(true);
  });

  it('matches "acceptance criteria" case-insensitively', () => {
    expect(hasDodMarker('## Acceptance Criteria\nsome text')).toBe(true);
  });

  it('matches "definition of done"', () => {
    expect(hasDodMarker('here is the Definition of Done for this issue')).toBe(true);
  });

  it('matches a bare DoD mention', () => {
    expect(hasDodMarker('DoD: green gate')).toBe(true);
  });

  it('returns false for a body with none of the markers', () => {
    expect(hasDodMarker('just a plain description, no checklist')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(hasDodMarker(null)).toBe(false);
    expect(hasDodMarker(undefined)).toBe(false);
  });
});
