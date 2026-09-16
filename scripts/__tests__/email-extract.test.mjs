/**
 * Tests for lib/leads/email-extract.mjs — pulling real contact addresses out of
 * a business's own site, without inventing any.
 */
import { describe, expect, it } from 'vitest';

import {
  contactUrls,
  extractEmails,
  isUsableAddress,
  pickBestAddress,
} from '../../lib/leads/email-extract.mjs';

describe('isUsableAddress', () => {
  it('accepts an ordinary business address', () => {
    expect(isUsableAddress('office@bobsplumbing.com')).toBe(true);
  });

  it.each([
    ['not-an-email', 'no @'],
    ['a@b', 'no TLD'],
    ['noreply@bobsplumbing.com', 'noreply is not a human'],
    ['you@example.com', 'placeholder domain'],
    ['logo@2x.png', 'an image filename that looks like an address'],
    ['hero@sprite.svg', 'another asset'],
    ['a1b2c3d4e5f6a7b8@cdn.io', 'hex localpart — a tracking artifact'],
    ['name@yourdomain.com', 'template placeholder'],
    [
      'npm-oidc-no-reply@github.com',
      'PREFIXED no-reply — found by a real fetch, missed by exact matching',
    ],
    ['bounce-noreply@acme.com', 'suffixed noreply'],
    ['mailer-daemon@acme.com', 'automated sender'],
    ['postmaster@acme.com', 'automated sender'],
  ])('rejects %s (%s)', (addr) => {
    expect(isUsableAddress(addr)).toBe(false);
  });

  it('rejects non-strings and empties without throwing', () => {
    for (const v of [null, undefined, 42, '', '   ']) expect(isUsableAddress(v)).toBe(false);
  });
});

describe('extractEmails', () => {
  it('finds a mailto and marks its source', () => {
    const out = extractEmails('<a href="mailto:office@acme.com">Email us</a>');
    expect(out).toEqual([{ address: 'office@acme.com', source: 'mailto' }]);
  });

  it('finds a bare address in body text', () => {
    expect(extractEmails('<p>Reach us at office@acme.com any time.</p>')).toEqual([
      { address: 'office@acme.com', source: 'text' },
    ]);
  });

  it('ranks mailto above bare text — a mailto is markup the author wrote to be contacted at', () => {
    const html = '<p>supplier@other.com</p><a href="mailto:office@acme.com">Us</a>';
    expect(extractEmails(html).map((e) => e.source)).toEqual(['mailto', 'text']);
  });

  it('dedupes an address that appears as both mailto and text, keeping mailto', () => {
    const out = extractEmails('<a href="mailto:o@acme.com">o@acme.com</a>');
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('mailto');
  });

  it('decodes a percent-encoded mailto', () => {
    expect(extractEmails('<a href="mailto:office%40acme.com">x</a>')[0]?.address).toBe(
      'office@acme.com',
    );
  });

  it('strips a mailto query string', () => {
    expect(extractEmails('<a href="mailto:o@acme.com?subject=Hi%20there">x</a>')[0]?.address).toBe(
      'o@acme.com',
    );
  });

  it('lowercases so the same address is not stored twice', () => {
    expect(extractEmails('Office@Acme.com')[0].address).toBe('office@acme.com');
  });

  it('filters junk out of a realistic footer', () => {
    const html = `
      <img src="logo@2x.png">
      <a href="mailto:noreply@acme.com">no</a>
      <a href="mailto:office@acme.com">yes</a>
      <p>Site by studio@webdesigners.io</p>`;
    expect(extractEmails(html).map((e) => e.address)).toEqual([
      'office@acme.com',
      'studio@webdesigners.io',
    ]);
  });

  it('returns [] for empty or non-string input', () => {
    for (const v of ['', null, undefined, 123]) expect(extractEmails(v)).toEqual([]);
  });
});

describe('pickBestAddress — never mail the webmaster instead of the business', () => {
  const candidates = [
    { address: 'studio@webdesigners.io', source: 'mailto' },
    { address: 'office@acme.com', source: 'text' },
  ];

  it('prefers the own-domain address even when the other is a mailto', () => {
    const best = pickBestAddress(candidates, 'acme.com');
    expect(best.address).toBe('office@acme.com');
    expect(best.ownDomain).toBe(true);
  });

  it('prefers a mailto when neither is on the own domain', () => {
    const best = pickBestAddress(candidates, 'somewhereelse.com');
    expect(best.address).toBe('studio@webdesigners.io');
  });

  it('treats www. as the same host', () => {
    expect(
      pickBestAddress([{ address: 'o@acme.com', source: 'text' }], 'www.acme.com').ownDomain,
    ).toBe(true);
  });

  it('counts a subdomain address as own-domain', () => {
    expect(
      pickBestAddress([{ address: 'o@mail.acme.com', source: 'text' }], 'acme.com').ownDomain,
    ).toBe(true);
  });

  it('returns null when nothing is usable', () => {
    expect(
      pickBestAddress([{ address: 'noreply@acme.com', source: 'mailto' }], 'acme.com'),
    ).toBeNull();
    expect(pickBestAddress([], 'acme.com')).toBeNull();
    expect(pickBestAddress(null)).toBeNull();
  });

  it('works with no siteHost — falls back to mailto preference', () => {
    expect(pickBestAddress(candidates).address).toBe('studio@webdesigners.io');
  });
});

describe('contactUrls', () => {
  it('builds a small fixed set on the site origin', () => {
    expect(contactUrls('https://acme.com/some/page')).toEqual([
      'https://acme.com/contact',
      'https://acme.com/contact-us',
      'https://acme.com/about',
      'https://acme.com/contact.html',
    ]);
  });

  it('assumes https for a bare host', () => {
    expect(contactUrls('acme.com')[0]).toBe('https://acme.com/contact');
  });

  it('returns [] for an unparseable url rather than throwing', () => {
    expect(contactUrls('not a url at all')).toEqual([]);
    expect(contactUrls('')).toEqual([]);
  });
});
