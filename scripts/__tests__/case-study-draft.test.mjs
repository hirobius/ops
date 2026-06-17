/**
 * Tests for scripts/case-study-draft.mjs — schema-slot a free-form note
 * into a Context/Problem/Approach/Outcome/Artefacts case-study JSON.
 *
 * Refs: t_2f4563eb / Self bundle — case-study-draft
 */

import { describe, it, expect } from 'vitest';
import { draftCaseStudy, CASE_STUDY_FIELDS } from '../case-study-draft.mjs';

describe('CASE_STUDY_FIELDS', () => {
  it('lists the five canonical sections in order', () => {
    expect(CASE_STUDY_FIELDS).toEqual(['context', 'problem', 'approach', 'outcome', 'artefacts']);
  });
});

describe('draftCaseStudy', () => {
  it('returns a record with all canonical sections + slug + rawNotes', () => {
    const r = draftCaseStudy({ slug: 'lilac', text: 'just rambling' });
    expect(r.slug).toBe('lilac');
    for (const f of CASE_STUDY_FIELDS) expect(r[f]).toBeDefined();
    expect(r.rawNotes).toBe('just rambling');
  });

  it('extracts headings (## Context, ## Problem, …) when present', () => {
    const text = [
      '## Context',
      'Insurance agency, solo founder, manual processes.',
      '',
      '## Problem',
      'Spending 6h/wk on inbox triage.',
      '',
      '## Approach',
      'Built classifier + Graph rules.',
    ].join('\n');
    const r = draftCaseStudy({ slug: 'lilac', text });
    expect(r.context).toContain('solo founder');
    expect(r.problem).toContain('6h/wk');
    expect(r.approach).toContain('classifier');
    expect(r.outcome).toBe(''); // not present in input
  });

  it('is case-insensitive for headings', () => {
    const text = '## context\nx\n## OUTCOME\ny';
    const r = draftCaseStudy({ slug: 's', text });
    expect(r.context).toBe('x');
    expect(r.outcome).toBe('y');
  });

  it('puts everything in rawNotes regardless of heading match', () => {
    const text = '## Context\nA\n## Outcome\nB';
    const r = draftCaseStudy({ slug: 's', text });
    expect(r.rawNotes).toBe(text);
  });

  it('returns empty-string sections (not null) when input has no headings', () => {
    const r = draftCaseStudy({ slug: 's', text: 'free-form rant with no structure' });
    for (const f of CASE_STUDY_FIELDS) expect(r[f]).toBe('');
  });

  it('includes a draftedAt ISO timestamp', () => {
    const r = draftCaseStudy({ slug: 's', text: 'x' });
    expect(r.draftedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
