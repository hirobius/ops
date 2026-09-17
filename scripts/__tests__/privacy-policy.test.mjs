/**
 * Tests for lib/compliance/policy.mjs — the public privacy policy (ops#38) and
 * the CAN-SPAM outreach footer, both rendered from ONE identity module
 * (lib/compliance/identity.mjs) so the privacy contact email changes in one place.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { canSpamFooter, renderPrivacyPolicy } from '../../lib/compliance/policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = readFileSync(join(ROOT, 'docs/prospecting/privacy-policy.md'), 'utf8');

describe('renderPrivacyPolicy', () => {
  test('fills the entity, mailing address, privacy contact and effective date', () => {
    const page = renderPrivacyPolicy(TEMPLATE, { effectiveDate: '2026-09-16' });

    expect(page).toContain('Hirobius LLC');
    expect(page).toContain('44 W 29th Ave, Spokane, WA 99203');
    expect(page).toContain('adrian@hirobius.com');
    expect(page).toContain('2026-09-16');
    expect(page).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test('publishes only the policy between the markers, not the reviewer notes or claim ledger', () => {
    const page = renderPrivacyPolicy(TEMPLATE, { effectiveDate: '2026-09-16' });

    expect(page.startsWith('# Privacy Policy')).toBe(true);
    expect(page).not.toContain('source template');
    expect(page).not.toContain('Claim ledger');
    expect(page).not.toContain('privacy-policy:');
  });

  test('refuses a template without the begin/end markers', () => {
    expect(() => renderPrivacyPolicy('# Privacy Policy', { effectiveDate: '2026-09-16' })).toThrow(
      /privacy-policy:begin/,
    );
  });

  test('refuses a missing or malformed effective date rather than publishing a blank one', () => {
    expect(() => renderPrivacyPolicy(TEMPLATE, {})).toThrow(/effective date/i);
    expect(() => renderPrivacyPolicy(TEMPLATE, { effectiveDate: 'next Tuesday' })).toThrow(
      /YYYY-MM-DD/,
    );
  });

  test('refuses a token it has no value for, instead of publishing "undefined"', () => {
    const doc = '<!-- privacy-policy:begin -->\nCall {{FAX_NUMBER}}\n<!-- privacy-policy:end -->';
    expect(() => renderPrivacyPolicy(doc, { effectiveDate: '2026-09-16' })).toThrow(/FAX_NUMBER/);
  });
});

describe('the retention window the policy publishes is the one the purge job enforces', () => {
  test('purge-stale-leads takes its default window from lib/compliance/retention.mjs', () => {
    const purge = readFileSync(join(ROOT, 'scripts/purge-stale-leads.mjs'), 'utf8');

    expect(purge).toMatch(
      /import \{ RETENTION_MONTHS \} from '\.\.\/lib\/compliance\/retention\.mjs'/,
    );
    expect(purge).toMatch(/months: RETENTION_MONTHS/);
  });

  test('the published policy states that window', () => {
    const page = renderPrivacyPolicy(TEMPLATE, { effectiveDate: '2026-09-16' });
    expect(page).toContain('12 months after we first collected it');
  });
});

describe('the privacy contact lives in exactly one place', () => {
  // Adrian is moving the privacy contact to a dedicated address. That must be a
  // one-line edit to lib/compliance/identity.mjs, so no other privacy surface may
  // spell out an address — they all read PRIVACY_CONTACT_EMAIL.
  const EMAIL_LITERAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;

  const surfaces = [
    'docs/prospecting/privacy-policy.md',
    'docs/prospecting/compliance.md',
    ...readdirSync(join(ROOT, 'lib/compliance'))
      .filter((f) => f !== 'identity.mjs')
      .map((f) => `lib/compliance/${f}`),
    ...readdirSync(join(ROOT, 'scripts'))
      .filter((f) => /privacy/.test(f) && f.endsWith('.mjs'))
      .map((f) => `scripts/${f}`),
  ];

  test.each(surfaces)('%s spells out no email address', (file) => {
    const match = readFileSync(join(ROOT, file), 'utf8').match(EMAIL_LITERAL);
    expect(match?.[0] ?? null).toBeNull();
  });
});

describe('canSpamFooter', () => {
  test('carries what CAN-SPAM requires: sender identity, physical address, ad disclosure, opt-out', () => {
    const footer = canSpamFooter();

    expect(footer).toContain('Hirobius LLC');
    expect(footer).toContain('44 W 29th Ave, Spokane, WA 99203');
    expect(footer).toMatch(/advertisement/i);
    expect(footer).toMatch(/reply "unsubscribe"/i);
    expect(footer).toContain('adrian@hirobius.com');
  });

  test('links the privacy policy when it has a public URL, and says nothing about it when it does not', () => {
    expect(canSpamFooter({ policyUrl: 'https://www.hirobius.com/privacy' })).toContain(
      'https://www.hirobius.com/privacy',
    );

    const unhosted = canSpamFooter({ policyUrl: null });
    expect(unhosted).not.toMatch(/privacy policy/i);
    expect(unhosted).not.toContain('null');
  });
});
