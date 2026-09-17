// @vitest-environment node
/**
 * The no-key sourcing paths must emit leads that can actually be generated.
 *
 * Two places manufacture synthetic leads: `pullLeads()` mock mode (no
 * OUTSCRAPER_API_KEY — dev + Preview) and the checked-in Outscraper fixture that
 * `scripts/outscraper-fetch.mjs --fixture … --supabase` can seed from. Both feed
 * `generateLeadSite` → `assemble()` → `defineClient()`, and assemble() copies
 * `lead.phone` verbatim. When the ops#310 re-sync tightened `business.phone` to a
 * 10-digit NANP number, both sources still produced the old 8-digit
 * `+1-555-0100` shape, so every generate burned its repair loop and 500'd.
 *
 * These run each synthetic lead through the same row → pipeline-lead mapping
 * `lib/leads/pipeline.mjs` uses, so the next tightening of the contract fails
 * here instead of on the board.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { pullLeads } from '../../lib/lead-gen/index.mjs';
import { assemble } from '../../lib/agent/generate.mjs';
import { defineClient } from '../../lib/schema/index.mjs';
import { normalizeResponse } from '../../scripts/lib/outscraper-normalize.mjs';
import { prospectsToLeadRows } from '../../scripts/lib/prospect-to-lead.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../../fixtures/outscraper-maps-search/response.json');

const CONTENT = {
  palettePreset: 'landscaping',
  font: 'system',
  heroHeadline: 'Local Work Done Right',
  heroSub: 'Local, reliable, fast.',
  ctaLabel: 'Get a Free Quote',
  about: 'We serve the area with pride.',
  serviceAreas: ['Austin, TX'],
  services: [{ title: 'Yard care', description: 'Fast, reliable yard care.' }],
  reviews: [],
  seoTitle: 'Local Work | Yard Care',
  seoDescription: 'Fast, reliable yard care in the area.',
};

/**
 * A `leads` row → the pipeline lead, mirroring generateLeadSite's mapping.
 * `any`: rows come from untyped .mjs sourcing (mock SourcedLead / fixture row).
 */
function toPipelineLead(row: any) {
  return {
    name: row.name,
    category: row.category ?? undefined,
    city: row.city,
    region: row.region,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    hours: row.hours ?? undefined,
    streetAddress: row.street_address ?? undefined,
    photos: Array.isArray(row.photos) ? row.photos : [],
  };
}

describe('pullLeads mock mode (no OUTSCRAPER_API_KEY)', () => {
  beforeEach(() => {
    vi.stubEnv('OUTSCRAPER_API_KEY', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emits leads whose phone passes defineClient once assembled (all 60 rows)', async () => {
    const leads = await pullLeads({ niche: 'landscaping', metro: 'Austin, TX', max: 60 });
    expect(leads).toHaveLength(60);
    for (const lead of leads) {
      expect(() => defineClient(assemble(toPipelineLead(lead), CONTENT))).not.toThrow();
    }
  });

  it('uses the non-dialable 555 area code, never a plausible real number', async () => {
    const leads = await pullLeads({ niche: 'landscaping', metro: 'Austin, TX', max: 60 });
    for (const lead of leads) {
      expect(lead.phone?.replace(/\D/g, '')).toMatch(/^555\d{7}$/);
    }
  });
});

describe('Outscraper fixture (fixtures/outscraper-maps-search/response.json)', () => {
  const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const rows = prospectsToLeadRows(normalizeResponse(body.data), 'fixture-run');

  it('seeds leads whose phone passes defineClient once assembled', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.phone).toBeTruthy();
      expect(() => defineClient(assemble(toPipelineLead(row), CONTENT))).not.toThrow();
    }
  });
});
