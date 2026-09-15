/**
 * Tests for lib/outreach/guard.mjs — the single outbound choke point for
 * cold outreach (#9). Mirrors lilac's automations/_shared/test-mode-guard.mjs:
 * every send decision routes through one pure function, so "could this have
 * emailed a real prospect?" is answerable by reading one file.
 */
import { describe, expect, it } from 'vitest';

import { OUTREACH_MODES, guardOutreach, plusTag, resolveMode } from '../../lib/outreach/guard.mjs';

const lead = (email, name = 'Acme Co') => ({
  email,
  custom_fields: { business_name: name, trade: 'plumber', city: 'Tacoma', preview_url: '' },
});

describe('resolveMode', () => {
  it('defaults to dry-run when neither flag is given', () => {
    expect(resolveMode({})).toBe('dry-run');
  });

  it('returns live for --apply', () => {
    expect(resolveMode({ apply: true })).toBe('live');
  });

  it('returns rehearse when a rehearsal recipient is given', () => {
    expect(resolveMode({ rehearse: 'me@x.com' })).toBe('rehearse');
  });

  it('refuses --apply and --rehearse together rather than guessing', () => {
    expect(() => resolveMode({ apply: true, rehearse: 'me@x.com' })).toThrow(
      /both --apply and --rehearse/i,
    );
  });

  it('exposes exactly the three modes', () => {
    expect(OUTREACH_MODES).toEqual(['dry-run', 'rehearse', 'live']);
  });
});

describe('plusTag', () => {
  it('inserts a plus tag before the @', () => {
    expect(plusTag('adrian@hirobius.com', 'r1')).toBe('adrian+r1@hirobius.com');
  });

  it('replaces an existing plus tag rather than stacking them', () => {
    expect(plusTag('adrian+old@hirobius.com', 'r2')).toBe('adrian+r2@hirobius.com');
  });

  it('rejects a non-address', () => {
    expect(() => plusTag('not-an-email', 'r1')).toThrow(/valid email/i);
  });
});

describe('guardOutreach — dry-run (the default)', () => {
  it('never sends and never rewrites', () => {
    const out = guardOutreach({ mode: 'dry-run', leads: [lead('real@prospect.com')] });
    expect(out.send).toBe(false);
    expect(out.leads).toEqual([]);
    expect(out.preview[0].email).toBe('real@prospect.com');
  });
});

describe('guardOutreach — rehearse', () => {
  const leads = [
    lead('a@prospect.com', 'A'),
    lead('b@prospect.com', 'B'),
    lead('c@prospect.com', 'C'),
  ];

  it('rewrites every recipient to the rehearsal address', () => {
    const out = guardOutreach({
      mode: 'rehearse',
      rehearsalRecipient: 'adrian@hirobius.com',
      leads,
    });
    expect(out.send).toBe(true);
    expect(out.leads.map((l) => l.email)).toEqual([
      'adrian+rehearse1@hirobius.com',
      'adrian+rehearse2@hirobius.com',
      'adrian+rehearse3@hirobius.com',
    ]);
  });

  it('leaves no real prospect address anywhere in the outbound payload', () => {
    const out = guardOutreach({
      mode: 'rehearse',
      rehearsalRecipient: 'adrian@hirobius.com',
      leads,
    });
    expect(JSON.stringify(out.leads)).not.toContain('@prospect.com');
  });

  it('keeps the real merge-field data so the rehearsal proves the template', () => {
    const out = guardOutreach({
      mode: 'rehearse',
      rehearsalRecipient: 'adrian@hirobius.com',
      leads,
    });
    expect(out.leads[0].custom_fields.business_name).toBe('A');
    expect(out.leads[0].custom_fields.trade).toBe('plumber');
  });

  it('records the rewrite mapping so the operator can see what it stood in for', () => {
    const out = guardOutreach({
      mode: 'rehearse',
      rehearsalRecipient: 'adrian@hirobius.com',
      leads,
    });
    expect(out.rewrites[0]).toEqual({
      from: 'a@prospect.com',
      to: 'adrian+rehearse1@hirobius.com',
      business: 'A',
    });
  });

  it('caps the batch — a rehearsal does not need 50 copies', () => {
    const many = Array.from({ length: 20 }, (_, i) => lead(`p${i}@prospect.com`, `B${i}`));
    const out = guardOutreach({
      mode: 'rehearse',
      rehearsalRecipient: 'adrian@hirobius.com',
      leads: many,
    });
    expect(out.leads).toHaveLength(3);
    expect(out.capped).toBe(true);
  });

  it('refuses to rehearse without a recipient', () => {
    expect(() => guardOutreach({ mode: 'rehearse', leads })).toThrow(/rehearsalRecipient/i);
  });

  it('refuses a malformed rehearsal recipient', () => {
    expect(() => guardOutreach({ mode: 'rehearse', rehearsalRecipient: 'nope', leads })).toThrow(
      /valid email/i,
    );
  });
});

describe('guardOutreach — live', () => {
  it('passes real leads through untouched', () => {
    const leads = [lead('real@prospect.com')];
    const out = guardOutreach({ mode: 'live', leads });
    expect(out.send).toBe(true);
    expect(out.leads[0].email).toBe('real@prospect.com');
    expect(out.rewrites).toEqual([]);
  });

  it('refuses a lead with no email rather than shipping a broken row', () => {
    expect(() => guardOutreach({ mode: 'live', leads: [{ custom_fields: {} }] })).toThrow(
      /without an email/i,
    );
  });

  it('refuses a payload still carrying a rehearsal tag — a rehearsal batch must never go live', () => {
    expect(() =>
      guardOutreach({ mode: 'live', leads: [lead('adrian+rehearse1@hirobius.com')] }),
    ).toThrow(/rehearsal address/i);
  });
});

describe('guardOutreach — contract', () => {
  it('rejects an unknown mode instead of defaulting to something', () => {
    expect(() => guardOutreach({ mode: 'yolo', leads: [] })).toThrow(/unknown outreach mode/i);
  });

  it('rejects a non-array leads argument', () => {
    expect(() => guardOutreach({ mode: 'dry-run', leads: null })).toThrow(
      /leads must be an array/i,
    );
  });
});
