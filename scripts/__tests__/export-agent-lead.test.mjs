/**
 * Tests for scripts/export-agent-lead.mjs — the Prospect → agent-lead handoff
 * mapper. Pure/offline (node:test), no batch file or network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prospectToAgentLead } from '../export-agent-lead.mjs';

const RICH = {
  slug: 'cascade-fence-olympia',
  name: 'Cascade Fence & Deck',
  category: 'Fence contractor',
  address: '123 Capitol Way, Olympia, WA 98501',
  city: 'Olympia',
  region: 'WA',
  phone: '+1 360-555-0100',
  website: '',
  rating: 4.8,
  reviews: 87,
  photosCount: 32,
  placeId: 'PLACE-1',
  signals: { leadScore: 88, buildScore: 79, sitePresence: 'none' },
  content: {
    description: 'Family-owned fencing and deck builder since 2009.',
    hours: { Monday: ['8AM-5PM'] },
    photos: ['https://img.example/cascade-1.jpg'],
    logoUrl: 'https://img.example/logo.png',
    types: ['Fence contractor', 'Deck builder'],
    email: 'info@cascade.example',
    postalCode: '98501',
    businessStatus: 'OPERATIONAL',
  },
};

test('maps clients LeadSchema fields from a prospect', () => {
  const lead = prospectToAgentLead(RICH);
  assert.equal(lead.name, 'Cascade Fence & Deck');
  assert.equal(lead.category, 'Fence contractor');
  assert.equal(lead.city, 'Olympia');
  assert.equal(lead.region, 'WA');
  assert.equal(lead.phone, '+1 360-555-0100');
  assert.equal(lead.email, 'info@cascade.example');
  assert.equal(lead.rating, 4.8);
  assert.equal(lead.reviewCount, 87);
});

test('notes carries scraped facts (description, reviews, categories, presence)', () => {
  const { notes } = prospectToAgentLead(RICH);
  assert.match(notes, /Family-owned fencing/);
  assert.match(notes, /87 Google reviews averaging 4.8/);
  assert.match(notes, /Fence contractor, Deck builder/);
  assert.match(notes, /Current web presence: none/);
});

test('_facts and _media carry real scraped data for the clients bridge', () => {
  const lead = prospectToAgentLead(RICH);
  assert.equal(lead._facts.address, '123 Capitol Way, Olympia, WA 98501');
  assert.deepEqual(lead._facts.hours, { Monday: ['8AM-5PM'] });
  assert.equal(lead._facts.leadScore, 88);
  assert.equal(lead._facts.buildScore, 79);
  assert.equal(lead._media.heroPhotoUrl, 'https://img.example/cascade-1.jpg');
  assert.equal(lead._media.logoUrl, 'https://img.example/logo.png');
});

test('handles a sparse prospect without content/signals (no throw, null media)', () => {
  const lead = prospectToAgentLead({ name: 'Bare Co', city: 'Bend', region: 'OR' });
  assert.equal(lead.name, 'Bare Co');
  assert.equal(lead.category, 'local service business'); // default
  assert.equal(lead.phone, undefined);
  assert.equal(lead._media.heroPhotoUrl, null);
  assert.equal(lead._facts.leadScore, null);
  assert.match(lead.notes, /Current web presence: unknown/);
});
