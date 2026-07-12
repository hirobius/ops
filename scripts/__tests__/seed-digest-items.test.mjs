/**
 * Tests for scripts/seed-digest-items.mjs pure core (ops#78).
 *
 * Covers the exported pure helpers — no network, no Supabase, no filesystem:
 *   slugify              title -> ascii slug
 *   digestItemKey         (date, title) -> stable idempotent-upsert key
 *   mapDigestFileToRows   parsed digest JSON -> digest_items rows
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { slugify, digestItemKey, mapDigestFileToRows } from '../seed-digest-items.mjs';

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

test('slugify lowercases and hyphenates non-alphanumerics', () => {
  assert.equal(slugify('Dashboard Trap — stop building dashboards'), 'dashboard-trap-stop-building-dashboards');
});

test('slugify trims leading/trailing hyphens from punctuation-only edges', () => {
  assert.equal(slugify('  "Quoted Title!"  '), 'quoted-title');
});

// ---------------------------------------------------------------------------
// digestItemKey
// ---------------------------------------------------------------------------

test('digestItemKey combines date and title slug with a stable separator', () => {
  assert.equal(digestItemKey('2026-07-01', 'Dashboard Trap'), '2026-07-01::dashboard-trap');
});

test('digestItemKey is stable across re-runs for the same input', () => {
  const a = digestItemKey('2026-07-01', 'Same Title');
  const b = digestItemKey('2026-07-01', 'Same Title');
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------
// mapDigestFileToRows
// ---------------------------------------------------------------------------

const sampleFile = {
  date: '2026-07-01',
  source: 'The Code (Superhuman)',
  items: [
    {
      title: 'Dashboard Trap',
      summary: 'A summary.',
      opsAngle: 'An angle.',
      links: [{ label: 'thread', url: 'https://x.com/a' }],
      tag: 'workflow',
      status: 'new',
    },
  ],
};

test('mapDigestFileToRows maps camelCase JSON fields to snake_case columns', () => {
  const rows = mapDigestFileToRows(sampleFile);
  assert.deepEqual(rows, [
    {
      item_key: '2026-07-01::dashboard-trap',
      date: '2026-07-01',
      source: 'The Code (Superhuman)',
      title: 'Dashboard Trap',
      summary: 'A summary.',
      ops_angle: 'An angle.',
      tag: 'workflow',
      links: [{ label: 'thread', url: 'https://x.com/a' }],
      status: 'new',
    },
  ]);
});

test('mapDigestFileToRows defaults optional fields to null/[] when absent', () => {
  const rows = mapDigestFileToRows({ date: '2026-07-02', items: [{ title: 'Bare item' }] });
  assert.deepEqual(rows[0], {
    item_key: '2026-07-02::bare-item',
    date: '2026-07-02',
    source: null,
    title: 'Bare item',
    summary: null,
    ops_angle: null,
    tag: null,
    links: [],
    status: 'new',
  });
});

test('mapDigestFileToRows skips items with a missing/blank title', () => {
  const rows = mapDigestFileToRows({
    date: '2026-07-01',
    items: [{ title: '' }, { title: '   ' }, {}, { title: 'Keep me' }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Keep me');
});

test('mapDigestFileToRows is total on missing/garbage input', () => {
  assert.deepEqual(mapDigestFileToRows(null), []);
  assert.deepEqual(mapDigestFileToRows({}), []);
  assert.deepEqual(mapDigestFileToRows({ date: '2026-07-01', items: 'not-an-array' }), []);
});
