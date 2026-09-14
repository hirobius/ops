/**
 * Unit tests for the Leads board's site-action decision helpers (#185).
 *
 * These are the pure parts of "which button does this lead get, and what does
 * its status badge look like" — extracted so the decision is testable without
 * mounting the page. Written test-first per CLAUDE.md §2.
 */
import { describe, it, expect } from 'vitest';
import { siteActionFor, STATUS_TONE, isRenderHandoff } from './leadActions';
import type { Lead, LeadStatus } from './types';

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    created_at: '2026-09-14T00:00:00Z',
    place_id: null,
    name: 'Acme',
    category: null,
    phone: null,
    website: null,
    city: null,
    region: null,
    rating: null,
    review_count: null,
    has_website: null,
    qualified: null,
    qualify_reason: null,
    street_address: null,
    postal_code: null,
    country: null,
    latitude: null,
    longitude: null,
    email: null,
    hours: null,
    photos: null,
    logo_url: null,
    social: null,
    google_maps_url: null,
    price_level: null,
    business_status: null,
    description: null,
    types: null,
    service_area: null,
    status: 'sourced',
    config: null,
    eval_score: null,
    eval_pass: null,
    eval_notes: null,
    loop_iterations: null,
    preview_url: null,
    sent_at: null,
    external_site_id: null,
    site_platform: null,
    editor_url: null,
    live_url: null,
    site_status: null,
    published_at: null,
    ...over,
  };
}

describe('siteActionFor', () => {
  it('offers render once a config exists (status scored)', () => {
    expect(siteActionFor(lead({ status: 'scored' }))).toEqual({
      kind: 'render',
      label: 'Render site',
    });
  });

  it('offers render when a config is present even if status lags', () => {
    expect(siteActionFor(lead({ status: 'sourced', config: { slug: 'acme' } }))).toEqual({
      kind: 'render',
      label: 'Render site',
    });
  });

  it('offers re-render for an already-rendered lead', () => {
    expect(siteActionFor(lead({ status: 'rendered', config: { slug: 'acme' } }))).toEqual({
      kind: 'render',
      label: 'Re-render',
    });
  });

  it('offers nothing when there is no config to render from', () => {
    expect(siteActionFor(lead({ status: 'sourced', config: null }))).toBeNull();
  });

  // #185: no UI path may dispatch the retired Duda actions.
  it('never returns a build or publish action', () => {
    const statuses: LeadStatus[] = [
      'sourced',
      'generating',
      'scored',
      'rendered',
      'sent',
      'won',
      'lost',
    ];
    for (const status of statuses) {
      for (const config of [null, { slug: 'acme' }]) {
        const action = siteActionFor(lead({ status, config }));
        if (action) expect(action.kind).toBe('render');
      }
    }
  });
});

describe('STATUS_TONE', () => {
  it('covers every LeadStatus, so the neutral fallback is never hit', () => {
    const statuses: LeadStatus[] = [
      'sourced',
      'generating',
      'scored',
      'rendered',
      'sent',
      'won',
      'lost',
    ];
    for (const status of statuses) expect(STATUS_TONE[status]).toBeDefined();
  });

  it('gives rendered its own dedicated tone', () => {
    expect(STATUS_TONE.rendered).toBe('success');
  });
});

describe('isRenderHandoff', () => {
  it('accepts a well-formed render response', () => {
    expect(
      isRenderHandoff({
        ok: true,
        configFile: 'export default {}',
        commands: 'pnpm new-client acme',
      }),
    ).toBe(true);
  });

  it('rejects a response missing the paste-ready parts', () => {
    expect(isRenderHandoff({ ok: true })).toBe(false);
    expect(isRenderHandoff({ ok: true, configFile: 'x' })).toBe(false);
    expect(isRenderHandoff(null)).toBe(false);
    expect(isRenderHandoff('nope')).toBe(false);
  });
});
