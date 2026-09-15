/**
 * lib/leads/pitch.mjs — the pitch queue's stage model.
 *
 * Two rules here are compliance, not preference, and are asserted as such: a
 * suppressed lead never re-enters the queue (#36), and marking a lead pitched
 * demands the channel, because `contacted_at` + `contact_channel` are the
 * evidence the #321 tripwire is evaluated on.
 */
import { describe, it, expect } from 'vitest';
import {
  isPitchStage,
  isPitchable,
  isTerminal,
  orderPitchQueue,
  pitchSummary,
  stagePatch,
  PITCH_STAGES,
} from '../../lib/leads/pitch.mjs';

const NOW = '2026-09-15T12:00:00.000Z';

describe('stagePatch', () => {
  it('rejects a stage outside the vocabulary rather than writing it', () => {
    expect(stagePatch('havering', {}, { now: NOW })).toMatchObject({ ok: false });
  });

  it('stamps contacted_at and the channel when a lead is pitched', () => {
    const r = stagePatch('sent', {}, { channel: 'phone', now: NOW });
    expect(r).toEqual({
      ok: true,
      patch: { outreach_status: 'sent', contact_channel: 'phone', contacted_at: NOW },
    });
  });

  // The channel is what makes the contact auditable later; defaulting it would
  // quietly produce a record nobody can stand behind.
  it('REFUSES to mark a lead pitched without a channel', () => {
    const r = stagePatch('sent', {}, { now: NOW });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/contact_channel is required/);
  });

  it('treats a whitespace-only channel as missing', () => {
    expect(stagePatch('sent', {}, { channel: '   ', now: NOW }).ok).toBe(false);
  });

  it('never overwrites an existing timestamp — first contact is a fact', () => {
    const r = stagePatch(
      'sent',
      { contactedAt: '2026-09-01T09:00:00.000Z' },
      { channel: 'phone', now: NOW },
    );
    expect(r).toEqual({
      ok: true,
      patch: { outreach_status: 'sent', contact_channel: 'phone' },
    });
  });

  it('stamps the right column for each later stage', () => {
    expect(stagePatch('replied', {}, { now: NOW }).patch).toMatchObject({ replied_at: NOW });
    expect(stagePatch('won', {}, { now: NOW }).patch).toMatchObject({ won_at: NOW });
    expect(stagePatch('lost', {}, { now: NOW }).patch).toMatchObject({ lost_at: NOW });
  });

  it('moving back to queued stamps nothing', () => {
    expect(stagePatch('queued', {}, { now: NOW })).toEqual({
      ok: true,
      patch: { outreach_status: 'queued' },
    });
  });
});

describe('isPitchable — the two compliance gates', () => {
  it('excludes a suppressed lead even when it has a site', () => {
    expect(isPitchable({ do_not_contact: true, preview_url: 'https://x.vercel.app' })).toBe(false);
  });

  it('excludes a lead with no site — there is nothing to pitch', () => {
    expect(isPitchable({ do_not_contact: false, preview_url: null })).toBe(false);
    expect(isPitchable({ do_not_contact: false, preview_url: '' })).toBe(false);
  });

  it('includes a lead with a site and no suppression', () => {
    expect(isPitchable({ do_not_contact: false, preview_url: 'https://x.vercel.app' })).toBe(true);
  });

  it('survives a missing lead rather than throwing', () => {
    expect(isPitchable(null)).toBe(false);
  });
});

describe('orderPitchQueue', () => {
  const leads = [
    { name: 'Won Co', outreach_status: 'won', lead_score: 99 },
    { name: 'Alpha', outreach_status: 'queued', lead_score: 80 },
    { name: 'Bravo', outreach_status: 'queued', lead_score: 94 },
    { name: 'Charlie', outreach_status: 'sent', lead_score: 96 },
    { name: 'Lost Co', outreach_status: 'lost', lead_score: 97 },
  ];

  it('puts untouched leads first — that is the job', () => {
    expect(orderPitchQueue(leads).map((l) => l.name)).toEqual([
      'Bravo',
      'Alpha',
      'Charlie',
      'Won Co',
      'Lost Co',
    ]);
  });

  // A partner needs to see a business was already lost, not wonder why it
  // vanished from the sheet.
  it('sinks terminal leads rather than dropping them', () => {
    const names = orderPitchQueue(leads).map((l) => l.name);
    expect(names).toContain('Won Co');
    expect(names).toContain('Lost Co');
    expect(names.indexOf('Won Co')).toBeGreaterThan(names.indexOf('Charlie'));
  });

  it('breaks a score tie by name so the sheet is stable between polls', () => {
    const tied = [
      { name: 'Zulu', outreach_status: 'queued', lead_score: 90 },
      { name: 'Alpha', outreach_status: 'queued', lead_score: 90 },
    ];
    expect(orderPitchQueue(tied).map((l) => l.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('treats a missing status as queued', () => {
    const r = orderPitchQueue([
      { name: 'Done', outreach_status: 'won', lead_score: 99 },
      { name: 'Fresh', lead_score: 10 },
    ]);
    expect(r[0].name).toBe('Fresh');
  });

  it('does not mutate its input', () => {
    const input = [
      { name: 'B', lead_score: 1 },
      { name: 'A', lead_score: 2 },
    ];
    orderPitchQueue(input);
    expect(input.map((l) => l.name)).toEqual(['B', 'A']);
  });

  it('tolerates a non-array', () => {
    expect(orderPitchQueue(null)).toEqual([]);
  });
});

describe('pitchSummary', () => {
  it('counts the states a person actually cares about', () => {
    expect(
      pitchSummary([
        { outreach_status: 'queued' },
        {},
        { outreach_status: 'sent' },
        { outreach_status: 'replied' },
        { outreach_status: 'won' },
        { outreach_status: 'lost' },
      ]),
    ).toEqual({ total: 6, toPitch: 2, inPlay: 2, won: 1, closed: 2 });
  });

  it('zeroes cleanly on an empty queue', () => {
    expect(pitchSummary([])).toEqual({ total: 0, toPitch: 0, inPlay: 0, won: 0, closed: 0 });
  });
});

describe('vocabulary', () => {
  it('reuses the outreach_status values migration 0007 established', () => {
    expect(PITCH_STAGES).toEqual(['queued', 'sent', 'replied', 'won', 'lost']);
  });

  it('knows bounced is terminal even though it is not a manual step', () => {
    expect(isTerminal('bounced')).toBe(true);
    expect(isPitchStage('bounced')).toBe(false);
  });
});
