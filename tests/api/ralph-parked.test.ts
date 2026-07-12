/**
 * lib/tasks/ralph-parked.mjs — parked-inbox pure helpers (ops#141).
 *
 * parseParkedReason MUST parse the exact 🅿️ comment format park_issue writes
 * (ralph/lib.sh:281-295): `🅿️ **Ralph parked this issue** — <reason>\n(To
 * retry: ...)`. hasDodMarker MUST mirror ralph/next.sh:46-48's regex exactly
 * — it's the same check the intake filter runs, so the panel's hint has to
 * agree with what actually happens on re-queue.
 */
import { describe, it, expect } from 'vitest';
import { parseParkedReason, hasDodMarker } from '../../lib/tasks/ralph-parked.mjs';

describe('parseParkedReason', () => {
  it('extracts the reason from a standard park comment', () => {
    const body =
      '🅿️ **Ralph parked this issue** — gave up after 3 failed attempt(s) — last: red gate\n' +
      '(To retry: fix the cause, then re-add `ralph-ready`.)';
    expect(parseParkedReason(body)).toBe('gave up after 3 failed attempt(s) — last: red gate');
  });

  it('returns null for a comment that is not a park comment', () => {
    expect(parseParkedReason('just a regular comment')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseParkedReason(null)).toBeNull();
    expect(parseParkedReason(undefined)).toBeNull();
  });

  it('handles a reason that itself spans multiple lines', () => {
    const body =
      '🅿️ **Ralph parked this issue** — no acceptance criteria found in the body\n' +
      '(looked for a checklist or DoD section)\n' +
      '(To retry: fix the cause, then re-add `ralph-ready`.)';
    expect(parseParkedReason(body)).toBe(
      'no acceptance criteria found in the body\n(looked for a checklist or DoD section)',
    );
  });

  it('returns the whole remainder when the retry footer is missing', () => {
    const body = '🅿️ **Ralph parked this issue** — reason with no footer';
    expect(parseParkedReason(body)).toBe('reason with no footer');
  });
});

describe('hasDodMarker', () => {
  it('matches an unchecked markdown checklist item', () => {
    expect(hasDodMarker('## DoD\n- [ ] ship it')).toBe(true);
  });

  it('matches "acceptance" case-insensitively', () => {
    expect(hasDodMarker('## Acceptance Criteria\nfoo')).toBe(true);
  });

  it('matches "definition of done"', () => {
    expect(hasDodMarker('see the Definition of Done below')).toBe(true);
  });

  it('matches the DoD token but not as a substring of another word', () => {
    expect(hasDodMarker('**DoD**: green tests')).toBe(true);
    expect(hasDodMarker('the widgetDoDangle helper')).toBe(false);
  });

  it('returns false for a body with none of the markers', () => {
    expect(hasDodMarker('just a plain description, no checklist')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(hasDodMarker(null)).toBe(false);
    expect(hasDodMarker(undefined)).toBe(false);
  });
});
