/**
 * Tests for scripts/sales-pipeline.mjs — pure pipeline computation.
 *
 * Covers (Refs: t_30afbd9f / Sales A — sales-pipeline):
 *   - ageDays computation from lastContactAt vs now
 *   - overdue bucket = ageDays > overdueAfterDays
 *   - sort overdue by ageDays descending (most-stale first)
 *   - records without lastContactAt go in 'never-contacted' bucket
 *   - inactive clients excluded entirely from "needs touch" surfaces
 *   - nextTouchSuggestion preserved on output
 */

import { describe, it, expect } from 'vitest';
import { computePipeline, ageDays } from '../sales-pipeline.mjs';

const NOW = new Date('2026-05-10T12:00:00Z');

describe('ageDays', () => {
  it('returns the integer day delta from ISO date to now', () => {
    expect(ageDays('2026-05-08', NOW)).toBe(2);
  });

  it('returns 0 for same-day contact', () => {
    expect(ageDays('2026-05-10', NOW)).toBe(0);
  });

  it('returns null for missing or empty input', () => {
    expect(ageDays(null, NOW)).toBeNull();
    expect(ageDays(undefined, NOW)).toBeNull();
    expect(ageDays('', NOW)).toBeNull();
  });

  it('returns null for unparseable date strings', () => {
    expect(ageDays('not-a-date', NOW)).toBeNull();
  });
});

describe('computePipeline', () => {
  const records = [
    {
      slug: 'lilac-insure',
      status: 'active',
      lastContactAt: '2026-05-08',
      lastContactKind: 'email',
      nextTouchSuggestion: 'call',
      overdueAfterDays: 14,
    },
    {
      slug: 'the-ranch-foundation',
      status: 'active',
      lastContactAt: '2026-04-20',
      lastContactKind: 'meeting',
      nextTouchSuggestion: 'proposal',
      overdueAfterDays: 14,
    },
    {
      slug: 'prospect-001',
      status: 'prospect',
      lastContactAt: '2026-04-15',
      lastContactKind: 'call',
      nextTouchSuggestion: 'email',
      overdueAfterDays: 7,
    },
    {
      slug: 'paused-client',
      status: 'paused',
      lastContactAt: '2025-12-01',
      lastContactKind: 'email',
      nextTouchSuggestion: null,
      overdueAfterDays: 14,
    },
    {
      slug: 'cold-lead',
      status: 'prospect',
      lastContactAt: null,
      lastContactKind: null,
      nextTouchSuggestion: 'email',
      overdueAfterDays: 7,
    },
  ];

  it('counts all records (regardless of status) in totalClients', () => {
    const r = computePipeline(records, NOW);
    expect(r.totalClients).toBe(5);
  });

  it('puts active/prospect records with no contact in neverContacted bucket', () => {
    const r = computePipeline(records, NOW);
    expect(r.neverContacted.map((x) => x.slug)).toEqual(['cold-lead']);
  });

  it('marks records as overdue when ageDays > overdueAfterDays (active + prospect only)', () => {
    const r = computePipeline(records, NOW);
    expect(r.overdue.map((x) => x.slug)).toEqual(['prospect-001', 'the-ranch-foundation']);
  });

  it('sorts overdue by ageDays descending (most stale first)', () => {
    const r = computePipeline(records, NOW);
    expect(r.overdue[0].ageDays).toBeGreaterThan(r.overdue[1].ageDays);
  });

  it('puts active/prospect records within window into current bucket', () => {
    const r = computePipeline(records, NOW);
    expect(r.current.map((x) => x.slug)).toEqual(['lilac-insure']);
  });

  it('excludes paused/archived statuses from overdue and current buckets entirely', () => {
    const r = computePipeline(records, NOW);
    const all = [...r.overdue, ...r.current, ...r.neverContacted].map((x) => x.slug);
    expect(all).not.toContain('paused-client');
  });

  it('preserves nextTouchSuggestion on each output record', () => {
    const r = computePipeline(records, NOW);
    const lilac = r.current.find((x) => x.slug === 'lilac-insure');
    expect(lilac.nextTouchSuggestion).toBe('call');
  });
});
