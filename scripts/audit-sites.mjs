#!/usr/bin/env node
/**
 * scripts/audit-sites.mjs — the 3rd-score network shell (the bad-site play).
 *
 * Runs the site-quality scorer (scripts/lib/site-audit.mjs) over leads that
 * ALREADY have a website, using Google PageSpeed Insights so Google fetches the
 * prospect's site server-side — this repo only ever calls one host
 * (www.googleapis.com), never an arbitrary business domain (which the egress
 * allowlist blocks). ZERO Outscraper credits: it re-uses leads we already paid
 * to source.
 *
 * NEEDS (human-set; agents never touch .env*): PAGESPEED_API_KEY (free Google
 * Cloud key — the anonymous endpoint 429s immediately). Supabase env as usual.
 * Run with NODE_USE_ENV_PROXY=1 so the googleapis call traverses the proxy.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/audit-sites.mjs --limit 50            # report only
 *   NODE_USE_ENV_PROXY=1 node scripts/audit-sites.mjs --limit 300 --write   # also persist (needs migration 0006)
 *
 * FLAGS:
 *   --limit <n>        max leads to audit (default 50)
 *   --presence <p>     which leads: custom (default) | builder | all-with-site
 *   --concurrency <n>  parallel PSI calls (default 5)
 *   --write            update leads.site_quality_* in Supabase (needs 0006 migration)
 *   --json             machine-readable summary
 *   --help
 */

import { scoreSiteFromPageSpeed } from './lib/site-audit.mjs';

const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function parseArgs(argv) {
  const o = { limit: 50, presence: 'custom', concurrency: 5, write: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--limit': o.limit = Number(next()); break;
      case '--presence': o.presence = next(); break;
      case '--concurrency': o.concurrency = Number(next()); break;
      case '--write': o.write = true; break;
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      default: console.error(`Unknown flag: ${argv[i]}`); o.help = true;
    }
  }
  return o;
}

async function fetchPageSpeed(url, key) {
  const u = new URL(PSI);
  u.searchParams.set('url', url);
  u.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) u.searchParams.append('category', c);
  if (key) u.searchParams.set('key', key);
  const res = await fetch(u, { signal: AbortSignal.timeout(60000) });
  if (res.status === 429) throw new Error('PSI 429 — rate limited; set PAGESPEED_API_KEY (free) or lower --concurrency');
  if (!res.ok) throw new Error(`PSI ${res.status}`);
  return res.json();
}

/** Run `worker` over `items` with at most `n` in flight. */
async function pool(items, n, worker) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

function histogram(scores) {
  const buckets = [[80, 100], [60, 79], [40, 59], [20, 39], [0, 19]];
  return buckets.map(([lo, hi]) => {
    const n = scores.filter((s) => s >= lo && s <= hi).length;
    return `  ${String(lo).padStart(2)}–${String(hi).padStart(3)} redesign-need : ${'█'.repeat(Math.round(n / Math.max(1, scores.length) * 30))} ${n}`;
  }).join('\n');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log('See header. Needs PAGESPEED_API_KEY + Supabase env; run with NODE_USE_ENV_PROXY=1.'); process.exit(0); }
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    console.error(
      'PAGESPEED_API_KEY is not set — the anonymous PageSpeed endpoint 429s immediately.\n' +
      'Create a free key: https://console.cloud.google.com/apis/credentials (enable "PageSpeed Insights API"),\n' +
      'then set PAGESPEED_API_KEY on this environment. (Agents never read/write .env* — set it yourself.)\n' +
      'Continuing anonymously will likely rate-limit; pass --concurrency 1 to try a tiny sample.',
    );
  }

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  let q = sb.from('leads').select('id,name,website,city,region,review_count,lead_score,site_presence').not('website', 'is', null);
  if (o.presence === 'custom') q = q.eq('site_presence', 'custom');
  else if (o.presence === 'builder') q = q.eq('site_presence', 'builder');
  else q = q.neq('site_presence', 'none');
  q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) { console.error('Supabase read failed:', error.message || error); process.exit(1); }
  const leads = data || [];
  if (!o.json) console.log(`Auditing ${leads.length} lead site(s) via PageSpeed (presence=${o.presence})…\n`);

  let errors = 0;
  const results = await pool(leads, o.concurrency, async (lead) => {
    try {
      const psi = await fetchPageSpeed(lead.website, key);
      const s = scoreSiteFromPageSpeed(psi);
      return { lead, ...s };
    } catch (e) {
      errors++;
      return { lead, siteQualityScore: null, scored: false, issues: [String(e.message || e)] };
    }
  });

  const scored = results.filter((r) => r.scored && r.siteQualityScore != null);
  const scores = scored.map((r) => r.siteQualityScore);
  const badMobile = scored.filter((r) => !r.mobileFriendly).length;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  if (o.write) {
    let wrote = 0;
    for (const r of scored) {
      const { error: uerr } = await sb.from('leads').update({
        site_quality_score: r.siteQualityScore,
        site_pagespeed_mobile: r.mobilePerf,
        site_seo_score: r.seoScore,
        site_mobile_friendly: r.mobileFriendly,
        site_https: r.https,
        site_issues: r.issues,
        site_audited_at: new Date().toISOString(),
      }).eq('id', r.lead.id);
      if (!uerr) wrote++;
    }
    if (!o.json) console.log(`Wrote site-quality to ${wrote} row(s).\n`);
  }

  if (o.json) {
    console.log(JSON.stringify({ audited: leads.length, scored: scored.length, errors, avgRedesignNeed: avg, results: results.map((r) => ({ name: r.lead.name, website: r.lead.website, city: r.lead.city, reviews: r.lead.review_count, siteQualityScore: r.siteQualityScore, mobilePerf: r.mobilePerf, seoScore: r.seoScore, mobileFriendly: r.mobileFriendly, issues: r.issues })) }, null, 2));
    return;
  }

  console.log(`Scored ${scored.length}/${leads.length} (errors: ${errors}). Avg redesign-need: ${avg}/100. Not mobile-friendly: ${badMobile}/${scored.length}.\n`);
  console.log('Redesign-need distribution:');
  console.log(histogram(scores));
  console.log('\nTop redesign targets (bad site × established business = has money, needs help):');
  scored
    .filter((r) => r.lead.review_count >= 15) // established enough to afford + care
    .sort((a, b) => (b.siteQualityScore - a.siteQualityScore) || (b.lead.review_count - a.lead.review_count))
    .slice(0, 25)
    .forEach((r) => console.log(
      `  [${String(r.siteQualityScore).padStart(3)}] ${r.lead.name} · ${r.lead.review_count}rv · ${r.lead.city} · perf ${r.mobilePerf ?? '?'} seo ${r.seoScore ?? '?'}${r.mobileFriendly ? '' : ' · NOT mobile-friendly'}  → ${r.issues.slice(0, 2).join('; ')}`,
    ));
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
