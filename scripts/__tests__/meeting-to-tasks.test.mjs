/**
 * Tests for scripts/meeting-to-tasks.mjs — extract action items from a
 * transcript and produce proposed-units JSONL entries.
 *
 * Refs: t_d1fb7fd7 / Client-augment — meeting-to-tasks
 */

import { describe, it, expect } from 'vitest';
import { extractActionItems, toProposedUnits } from '../meeting-to-tasks.mjs';

describe('extractActionItems', () => {
  it('catches ACTION: lines (uppercase)', () => {
    const t = 'Some chat\nACTION: Adrian to send proposal\nMore chat';
    const items = extractActionItems(t);
    expect(items).toEqual([{ kind: 'ACTION', text: 'Adrian to send proposal', lineNumber: 2 }]);
  });

  it('catches TODO: and Action item: prefixes (case-insensitive)', () => {
    const t = 'todo: follow up on contract\nAction item: book next meeting';
    const items = extractActionItems(t);
    expect(items.map((i) => i.kind)).toEqual(['TODO', 'ACTION']);
  });

  it('catches markdown checkboxes [ ]', () => {
    const t = '- [ ] Sign DocuSign\n- [x] already done\n- [ ] Update website';
    const items = extractActionItems(t);
    expect(items.map((i) => i.text)).toEqual(['Sign DocuSign', 'Update website']);
  });

  it('catches DECISION: lines (separate kind)', () => {
    const t = 'DECISION: go with Tier 2 package';
    expect(extractActionItems(t)[0].kind).toBe('DECISION');
  });

  it('skips empty / colon-only / whitespace-only payloads', () => {
    const t = 'ACTION:   \nTODO:\n- [ ]    ';
    expect(extractActionItems(t)).toEqual([]);
  });

  it('returns empty array for transcripts with no recognized markers', () => {
    expect(extractActionItems('Just rambling text, no action items.')).toEqual([]);
  });
});

describe('toProposedUnits', () => {
  const items = [
    { kind: 'ACTION', text: 'Send the brand audit deck', lineNumber: 12 },
    { kind: 'DECISION', text: 'Go with Tier 2', lineNumber: 30 },
  ];
  const ts = '2026-05-11T00:00:00Z';

  it('emits one proposed-unit per action/decision item', () => {
    const lines = toProposedUnits(items, { slug: 'lilac-insure', transcriptPath: 'transcripts/2026-05-11.txt', ts });
    expect(lines).toHaveLength(2);
  });

  it('tags fromUnitId with meeting + slug + ts and references the transcript in agentNotes', () => {
    const [line] = toProposedUnits([items[0]], { slug: 'lilac-insure', transcriptPath: '/tmp/t.txt', ts });
    expect(line.fromUnitId).toMatch(/^meeting-lilac-insure-/);
    expect(line.proposedUnit.agentNotes.some((n) => n.includes('/tmp/t.txt'))).toBe(true);
  });

  it('sets reason="side-quest" for ACTION and "cleanup" for DECISION', () => {
    const lines = toProposedUnits(items, { slug: 'lilac-insure', transcriptPath: 't.txt', ts });
    expect(lines[0].reason).toBe('side-quest');
    expect(lines[1].reason).toBe('cleanup');
  });

  it('produces unique unit ids when multiple items share a slug', () => {
    const lines = toProposedUnits(items, { slug: 'lilac-insure', transcriptPath: 't.txt', ts });
    const ids = lines.map((l) => l.proposedUnit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defaults slug to "unscoped" when none is supplied', () => {
    const lines = toProposedUnits([items[0]], { transcriptPath: 't.txt', ts });
    expect(lines[0].fromUnitId).toMatch(/unscoped/);
  });

  it('marks proposed-units as safeForUnattended=false (need triage)', () => {
    const lines = toProposedUnits([items[0]], { transcriptPath: 't.txt', ts });
    expect(lines[0].proposedUnit.safeForUnattended).toBe(false);
  });
});
