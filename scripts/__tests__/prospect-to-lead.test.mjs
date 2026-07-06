/**
 * Tests for scripts/lib/prospect-to-lead.mjs — the pure Prospect -> `leads` row
 * mapper — plus the buildScore signal it depends on. Uses node:test so it runs
 * headless (`node --test`) without vitest / the design-system install.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizePlace, scoreBuildability } from '../lib/outscraper-normalize.mjs';
import {
  prospectToLeadRow,
  prospectsToLeadRows,
  QUALIFIED_LEAD_SCORE,
} from '../lib/prospect-to-lead.mjs';

// A rich, live-shaped Outscraper place (no PII — synthetic).
const RICH_PLACE = {
  name: 'Cascade Fence & Deck',
  place_id: 'PLACE-1',
  city: 'Olympia',
  state: 'Washington',
  state_code: 'WA',
  type: 'Fence contractor',
  subtypes: 'Fence contractor, Deck builder',
  reviews: 87,
  rating: 4.8,
  photos_count: 32,
  photo: 'https://img.example/cascade-1.jpg',
  description: 'Family-owned fencing and deck builder serving Thurston County since 2009.',
  working_hours: { Monday: ['8AM-5PM'], Tuesday: ['8AM-5PM'] },
  logo: 'https://img.example/cascade-logo.png',
  booking_appointment_link: 'https://cascade.example/quote',
  address: '123 Capitol Way, Olympia, WA 98501',
  postal_code: '98501',
  country: 'United States of America',
  latitude: 47.0379,
  longitude: -122.9007,
  business_status: 'OPERATIONAL',
  verified: true,
  location_link: 'https://maps.google.com/?cid=1',
  query: 'fence company in Olympia, WA',
  // no `website` -> sitePresence 'none' -> high leadScore
};

test('buildScore rewards rich material and is bounded 0..100', () => {
  const p = normalizePlace(RICH_PLACE);
  assert.ok(p.signals.buildScore > 70, `expected rich place to score high, got ${p.signals.buildScore}`);
  assert.ok(p.signals.buildScore <= 100);

  // An empty place has nothing to build from.
  const bare = normalizePlace({ name: 'Nothing Co', place_id: 'X' });
  assert.equal(bare.signals.buildScore, 0);
});

test('scoreBuildability is pure arithmetic over presence + volume', () => {
  const none = scoreBuildability({ photosCount: 0, reviews: 0 });
  assert.equal(none, 0);
  const withPhotosOnly = scoreBuildability({ photosCount: 40, reviews: 0 });
  assert.ok(withPhotosOnly > 0 && withPhotosOnly <= 25);
});

test('prospectToLeadRow maps every column from a rich prospect', () => {
  const p = normalizePlace(RICH_PLACE);
  const row = prospectToLeadRow(p, '2026-07-04T00-abc');

  assert.equal(row.place_id, 'PLACE-1');
  assert.equal(row.name, 'Cascade Fence & Deck');
  assert.equal(row.region, 'WA'); // state_code preferred
  assert.equal(row.website, null); // '' -> null
  assert.equal(row.has_website, false);
  assert.equal(row.review_count, 87);
  assert.equal(row.street_address, '123 Capitol Way, Olympia, WA 98501');
  assert.equal(row.google_maps_url, 'https://maps.google.com/?cid=1');
  assert.equal(row.status, 'sourced');
  assert.equal(row.site_presence, 'none');
  assert.equal(row.lead_score, p.signals.leadScore);
  assert.equal(row.build_score, p.signals.buildScore);
  assert.equal(row.photos_count, 32);
  assert.equal(row.owner_verified, true);
  assert.equal(row.operational, true);
  assert.equal(row.source_query, 'fence company in Olympia, WA');
  assert.equal(row.run_id, '2026-07-04T00-abc');
  assert.equal(row.slug, 'cascade-fence-deck-olympia');
  // richer content columns populated for the eventual site build
  assert.equal(row.description, RICH_PLACE.description);
  assert.deepEqual(row.hours, RICH_PLACE.working_hours);
  assert.deepEqual(row.photos, ['https://img.example/cascade-1.jpg']);
  assert.equal(row.logo_url, 'https://img.example/cascade-logo.png');
  assert.deepEqual(row.types, ['Fence contractor', 'Deck builder']);
  assert.equal(row.latitude, 47.0379);
});

test('qualified derives from leadScore >= threshold', () => {
  // no-website + reviews + verified + operational -> well above threshold
  const strong = prospectToLeadRow(normalizePlace(RICH_PLACE));
  assert.ok(strong.lead_score >= QUALIFIED_LEAD_SCORE);
  assert.equal(strong.qualified, true);
  assert.equal(strong.qualify_reason, 'none');

  // a custom-domain site with few reviews -> below threshold
  const weak = prospectToLeadRow(
    normalizePlace({ name: 'Big Corp', place_id: 'Y', website: 'https://bigcorp.com', reviews: 2 }),
  );
  assert.equal(weak.qualified, false);
});

test('empty string values become null (clean DB)', () => {
  const row = prospectToLeadRow(normalizePlace({ name: 'No Phone Co', place_id: 'Z' }));
  assert.equal(row.phone, null);
  assert.equal(row.category, null);
  assert.equal(row.email, null);
});

test('prospectsToLeadRows drops prospects with no place_id (upsert key)', () => {
  const prospects = [
    normalizePlace({ name: 'Has Id', place_id: 'A' }),
    normalizePlace({ name: 'No Id' }), // no place_id/google_id -> filtered
    normalizePlace({ name: 'Has Google Id', google_id: 'B' }),
  ];
  const rows = prospectsToLeadRows(prospects, 'run-1');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.place_id));
});
