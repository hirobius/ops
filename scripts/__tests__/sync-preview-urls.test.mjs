/**
 * Tests for scripts/sync-preview-urls.mjs pure core (issue #44).
 *
 * Covers the three exported pure helpers — no network, no Supabase, no Vercel:
 *   slugFromProjectName    project name -> comparable slug
 *   previewUrlFromDeployment  deployment -> https preview URL or null
 *   matchPreviewUpdates    (projects, leads) -> fill-only preview_url updates
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  slugFromProjectName,
  previewUrlFromDeployment,
  matchPreviewUpdates,
  DEFAULT_MAX,
} from '../sync-preview-urls.mjs';

// ---------------------------------------------------------------------------
// slugFromProjectName
// ---------------------------------------------------------------------------

test('slugFromProjectName strips the hirobius- prefix and lowercases', () => {
  assert.equal(slugFromProjectName('hirobius-monroe-street-power-wash'), 'monroe-street-power-wash');
  assert.equal(slugFromProjectName('Hirobius-Cascade-Fence'), 'cascade-fence');
});

test('slugFromProjectName passes bare (unprefixed) names through', () => {
  assert.equal(slugFromProjectName('cascade-fence-deck-wa'), 'cascade-fence-deck-wa');
});

test('slugFromProjectName is total on junk input', () => {
  assert.equal(slugFromProjectName(undefined), '');
  assert.equal(slugFromProjectName(null), '');
  assert.equal(slugFromProjectName(42), '');
});

// ---------------------------------------------------------------------------
// previewUrlFromDeployment
// ---------------------------------------------------------------------------

test('previewUrlFromDeployment returns an https URL for a READY preview', () => {
  assert.equal(
    previewUrlFromDeployment({ state: 'READY', url: 'monroe-abc123.vercel.app', target: null }),
    'https://monroe-abc123.vercel.app',
  );
});

test('previewUrlFromDeployment skips production, non-ready, and host-less deploys', () => {
  assert.equal(previewUrlFromDeployment({ state: 'READY', url: 'x.vercel.app', target: 'production' }), null);
  assert.equal(previewUrlFromDeployment({ state: 'BUILDING', url: 'x.vercel.app', target: null }), null);
  assert.equal(previewUrlFromDeployment({ state: 'READY', url: '', target: null }), null);
  assert.equal(previewUrlFromDeployment(null), null);
});

test('previewUrlFromDeployment does not double-prefix an already-qualified host', () => {
  assert.equal(
    previewUrlFromDeployment({ state: 'ready', url: 'https://x.vercel.app', target: null }),
    'https://x.vercel.app',
  );
});

// ---------------------------------------------------------------------------
// matchPreviewUpdates
// ---------------------------------------------------------------------------

const readyPreview = (name, host) => ({
  name,
  latestDeployment: { state: 'READY', url: host, target: null },
});

test('matchPreviewUpdates pairs a project to a lead by config.slug', () => {
  const projects = [readyPreview('hirobius-monroe-street-power-wash', 'monroe-abc.vercel.app')];
  const leads = [
    { id: 'L1', name: 'Monroe Street Power Wash', preview_url: null, config: { slug: 'monroe-street-power-wash' } },
  ];
  assert.deepEqual(matchPreviewUpdates(projects, leads), [
    {
      leadId: 'L1',
      leadName: 'Monroe Street Power Wash',
      slug: 'monroe-street-power-wash',
      previewUrl: 'https://monroe-abc.vercel.app',
    },
  ]);
});

test('matchPreviewUpdates is fill-only — skips leads that already have a preview_url', () => {
  const projects = [readyPreview('hirobius-monroe', 'monroe-new.vercel.app')];
  const leads = [{ id: 'L1', preview_url: 'https://monroe-old.vercel.app', config: { slug: 'monroe' } }];
  assert.deepEqual(matchPreviewUpdates(projects, leads), []);
});

test('matchPreviewUpdates ignores leads with no config.slug and unmatched slugs', () => {
  const projects = [readyPreview('hirobius-monroe', 'monroe.vercel.app')];
  const leads = [
    { id: 'L1', preview_url: null, config: null }, // no config
    { id: 'L2', preview_url: null, config: { slug: 'someone-else' } }, // no matching project
  ];
  assert.deepEqual(matchPreviewUpdates(projects, leads), []);
});

test('matchPreviewUpdates ignores projects whose only deployment is production/not-ready', () => {
  const projects = [
    { name: 'hirobius-monroe', latestDeployment: { state: 'READY', url: 'p.vercel.app', target: 'production' } },
    { name: 'hirobius-acme', latestDeployment: { state: 'BUILDING', url: 'a.vercel.app', target: null } },
  ];
  const leads = [
    { id: 'L1', preview_url: null, config: { slug: 'monroe' } },
    { id: 'L2', preview_url: null, config: { slug: 'acme' } },
  ];
  assert.deepEqual(matchPreviewUpdates(projects, leads), []);
});

test('matchPreviewUpdates matches a bare (unprefixed) project name', () => {
  const projects = [readyPreview('cascade-fence-deck-wa', 'cascade.vercel.app')];
  const leads = [{ id: 'L9', name: 'Cascade', preview_url: null, config: { slug: 'cascade-fence-deck-wa' } }];
  const out = matchPreviewUpdates(projects, leads);
  assert.equal(out.length, 1);
  assert.equal(out[0].previewUrl, 'https://cascade.vercel.app');
});

test('matchPreviewUpdates caps results at max', () => {
  const projects = [
    readyPreview('hirobius-a', 'a.vercel.app'),
    readyPreview('hirobius-b', 'b.vercel.app'),
    readyPreview('hirobius-c', 'c.vercel.app'),
  ];
  const leads = [
    { id: '1', preview_url: null, config: { slug: 'a' } },
    { id: '2', preview_url: null, config: { slug: 'b' } },
    { id: '3', preview_url: null, config: { slug: 'c' } },
  ];
  assert.equal(matchPreviewUpdates(projects, leads, { max: 2 }).length, 2);
});

test('matchPreviewUpdates is total on empty/garbage input and DEFAULT_MAX is sane', () => {
  assert.deepEqual(matchPreviewUpdates(undefined, undefined), []);
  assert.deepEqual(matchPreviewUpdates([], []), []);
  assert.ok(DEFAULT_MAX > 0);
});
