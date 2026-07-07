/**
 * Tests for scripts/lib/site-audit.mjs — the pure PageSpeed→redesign-need scorer.
 * Deterministic: fixed PSI fixtures, no network.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { scoreSiteFromPageSpeed } from '../lib/site-audit.mjs';

const goodSite = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.95 }, seo: { score: 0.98 },
      accessibility: { score: 0.9 }, 'best-practices': { score: 0.95 },
    },
    audits: {
      viewport: { score: 1 }, 'font-size': { score: 1 },
      'tap-targets': { score: 1 }, 'is-on-https': { score: 1 },
    },
  },
};

const badSite = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.2 }, seo: { score: 0.5 },
      accessibility: { score: 0.6 }, 'best-practices': { score: 0.4 },
    },
    audits: {
      viewport: { score: 0 }, 'font-size': { score: 0 },
      'tap-targets': { score: 0 }, 'is-on-https': { score: 0 },
    },
  },
};

test('a modern, fast, mobile-friendly site scores LOW redesign-need', () => {
  const r = scoreSiteFromPageSpeed(goodSite);
  assert.equal(r.scored, true);
  assert.ok(r.siteQualityScore < 15, `expected <15, got ${r.siteQualityScore}`);
  assert.equal(r.mobileFriendly, true);
  assert.equal(r.https, true);
  assert.deepEqual(r.issues, []);
});

test('a slow, non-mobile, insecure, weak-SEO site scores HIGH redesign-need with hooks', () => {
  const r = scoreSiteFromPageSpeed(badSite);
  assert.equal(r.scored, true);
  assert.ok(r.siteQualityScore > 60, `expected >60, got ${r.siteQualityScore}`);
  assert.equal(r.mobileFriendly, false);
  assert.equal(r.https, false);
  assert.equal(r.mobilePerf, 20);
  assert.equal(r.seoScore, 50);
  assert.ok(r.issues.some((i) => /mobile-friendly/.test(i)));
  assert.ok(r.issues.some((i) => /HTTPS/.test(i)));
  assert.ok(r.issues.some((i) => /performance/.test(i)));
});

test('a result PageSpeed could not analyze is flagged, not fabricated', () => {
  const r = scoreSiteFromPageSpeed({ lighthouseResult: null });
  assert.equal(r.scored, false);
  assert.equal(r.siteQualityScore, null);
  assert.ok(r.issues.length > 0);
});

test('bad site ranks higher redesign-need than good site', () => {
  assert.ok(
    scoreSiteFromPageSpeed(badSite).siteQualityScore > scoreSiteFromPageSpeed(goodSite).siteQualityScore,
  );
});
