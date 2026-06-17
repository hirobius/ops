/**
 * Tests for scripts/sales-proposal.mjs — deterministic tier routing.
 *
 * Covers (Refs: t_30afbd9f / Sales B — sales-proposal):
 *   - routeToTier: keyword match → tier id
 *   - default tier when no signals match
 *   - retainer detection orthogonal to tier
 *   - formatQuote: markdown output contains tier table, scope block
 */

import { describe, it, expect } from 'vitest';
import { routeToTier, formatQuote, TIERS } from '../sales-proposal.mjs';

describe('routeToTier', () => {
  it('routes "single landing page" → Tier 1', () => {
    const r = routeToTier('Need a single landing page with a contact form.');
    expect(r.recommendedTier).toBe('1');
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('routes a small business site with a blog → Tier 2', () => {
    const r = routeToTier('Small business site, maybe 3 pages plus a simple blog.');
    expect(r.recommendedTier).toBe('2');
  });

  it('routes ecommerce / shop / CMS scope → Tier 3', () => {
    const r = routeToTier('Need a full ecommerce store with a CMS and SEO.');
    expect(r.recommendedTier).toBe('3');
  });

  it('routes custom Figma + branding work → Tier 3', () => {
    const r = routeToTier('Want custom Figma design work and a full brand system.');
    expect(r.recommendedTier).toBe('3');
  });

  it('defaults to Tier 2 when no signals match', () => {
    const r = routeToTier('Hello, just wanted to chat.');
    expect(r.recommendedTier).toBe('2');
    expect(r.signals).toEqual([]);
  });

  it('flags includesRetainer when scope mentions ongoing / monthly / maintenance', () => {
    expect(routeToTier('Tier 2 build plus monthly maintenance').includesRetainer).toBe(true);
    expect(routeToTier('Need ongoing updates after launch').includesRetainer).toBe(true);
    expect(routeToTier('One-shot build, no retainer').includesRetainer).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(routeToTier('FULL ECOMMERCE STORE').recommendedTier).toBe('3');
  });

  it('exposes a TIERS catalog with the three packages + retainer', () => {
    expect(TIERS['1']).toBeDefined();
    expect(TIERS['2']).toBeDefined();
    expect(TIERS['3']).toBeDefined();
    expect(TIERS.retainer).toBeDefined();
    expect(TIERS['1'].price).toMatch(/\$/);
  });
});

describe('formatQuote', () => {
  it('includes the scope verbatim in a blockquote', () => {
    const md = formatQuote({ scope: 'Custom checkout flow', recommendedTier: '3', includesRetainer: false, signals: [] });
    expect(md).toMatch(/Custom checkout flow/);
    expect(md).toMatch(/^>/m); // blockquote marker
  });

  it('marks the recommended tier with bold in the table row', () => {
    const md = formatQuote({ scope: 'X', recommendedTier: '2', includesRetainer: false, signals: ['blog'] });
    expect(md).toMatch(/\*\*Tier 2[^|]*\*\*/);
  });

  it('emits a retainer line when includesRetainer=true', () => {
    const md = formatQuote({ scope: 'X', recommendedTier: '2', includesRetainer: true, signals: [] });
    expect(md.toLowerCase()).toMatch(/retainer/);
    expect(md).toMatch(TIERS.retainer.price);
  });

  it('lists detected signals when any matched', () => {
    const md = formatQuote({ scope: 'X', recommendedTier: '3', includesRetainer: false, signals: ['cms', 'seo'] });
    expect(md.toLowerCase()).toMatch(/detected signals/);
    expect(md).toMatch(/cms/i);
    expect(md).toMatch(/seo/i);
  });

  it('omits the signals section when no signals matched (default-tier case)', () => {
    const md = formatQuote({ scope: 'X', recommendedTier: '2', includesRetainer: false, signals: [] });
    expect(md.toLowerCase()).not.toMatch(/detected signals/);
  });
});
