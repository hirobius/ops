#!/usr/bin/env node
/**
 * scripts/crawl-lead-emails.mjs — find contact addresses on leads' own websites.
 *
 * 1 lead of 263 has an email. Google Business Profile has no email field, so no
 * Maps scraper returns one and the B2B enrichment tier covers 3-person trades
 * businesses badly. 223 leads DO have a website, and that is where the address
 * actually lives. This crawls those sites. No API key, no spend.
 *
 * COLLECTION ONLY. This script never sends anything. lib/outreach/guard.mjs
 * remains the single outbound choke point and is untouched by this file.
 *
 * NEVER GUESSES. Every address written was literally present in fetched HTML —
 * no `info@<domain>` inference. A fabricated contact detail is the same class of
 * error as fabricated site copy, and the same ban applies.
 *
 *   node scripts/crawl-lead-emails.mjs                  # dry run, all with a website
 *   node scripts/crawl-lead-emails.mjs --limit 20       # sample first
 *   node scripts/crawl-lead-emails.mjs --apply          # write leads.email
 *   node scripts/crawl-lead-emails.mjs --json
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Adrian-set; agents never read
 * or write .env* files).
 *
 * COMPLIANCE, stated here rather than only in a doc: CAN-SPAM restricts
 * addresses obtained by automated harvesting. Collecting is not sending, and
 * the scaled send is separately gated behind #35 -> #38 -> #27 -> #9. Read those
 * before a campaign goes out on addresses this script found.
 */

import { contactUrls, extractEmails, pickBestAddress } from '../lib/leads/email-extract.mjs';

const PAGE = 1000;
const UA = 'HirobiusBot/1.0 (+https://hirobius.com; contact discovery)';

function parseArgs(argv) {
  const o = {
    apply: false,
    limit: Infinity,
    concurrency: 5,
    timeoutMs: 12_000,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--timeout') o.timeoutMs = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`crawl-lead-emails.mjs — find contact addresses on leads' own sites. No API cost.

Usage:
  node scripts/crawl-lead-emails.mjs [--apply] [--limit <n>] [--concurrency <n>] [--json]

Targets leads with a website and no email yet. Fetches the homepage, then a few
contact URLs only if the homepage yielded nothing.

Flags:
  --dry-run         Report what WOULD be written. Default.
  --apply           Write leads.email for the addresses found.
  --limit <n>       Cap leads processed (default: all).
  --concurrency <n> Parallel fetches (default 5). Be polite.
  --timeout <ms>    Per-request timeout (default 12000).
  --json            Machine-readable.
  --help, -h        This message.

Never guesses an address, and never sends anything.
`);
}

/** Fetch one page's HTML, or null. A dead site is data, not an error. */
async function fetchHtml(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Homepage first; contact pages only if it yielded nothing. */
async function crawlOne(lead, timeoutMs) {
  const site = String(lead.website || '').trim();
  if (!site) return { lead, best: null, reason: 'no website' };

  const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return { lead, best: null, reason: 'unparseable website url' };
  }

  const home = await fetchHtml(url, timeoutMs);
  if (home === null) return { lead, best: null, reason: 'site unreachable' };

  let found = extractEmails(home);
  let via = 'homepage';

  if (!found.length) {
    for (const cu of contactUrls(url)) {
      const html = await fetchHtml(cu, timeoutMs);
      if (!html) continue;
      found = extractEmails(html);
      if (found.length) {
        via = cu.replace(/^https?:\/\/[^/]+/, '');
        break;
      }
    }
  }

  const best = pickBestAddress(found, host);
  return { lead, best, via, candidates: found.length, reason: best ? null : 'no address on site' };
}

/** Bounded-concurrency map. */
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function fetchTargets(sb, limit) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('leads')
      .select('id,name,website,email,do_not_contact')
      .not('website', 'is', null)
      .is('email', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Supabase read failed: ${error.message || error}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  // A suppressed lead's address is not ours to collect.
  const eligible = rows.filter((r) => r.do_not_contact !== true && String(r.website || '').trim());
  return limit === Infinity ? eligible : eligible.slice(0, limit);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  const targets = await fetchTargets(sb, o.limit);

  if (!o.json)
    console.log(`Crawling ${targets.length} lead site(s) at concurrency ${o.concurrency}…\n`);

  const results = await pool(targets, o.concurrency, (l) => crawlOne(l, o.timeoutMs));
  const hits = results.filter((r) => r.best);

  const byReason = {};
  for (const r of results.filter((x) => !x.best))
    byReason[r.reason] = (byReason[r.reason] || 0) + 1;

  if (o.json) {
    console.log(
      JSON.stringify(
        {
          crawled: results.length,
          found: hits.length,
          byReason,
          applied: o.apply,
          hits: hits.map((h) => ({
            id: h.lead.id,
            name: h.lead.name,
            address: h.best.address,
            source: h.best.source,
            ownDomain: h.best.ownDomain,
            via: h.via,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Found an address for ${hits.length} of ${results.length}.\n`);
    for (const h of hits.slice(0, 15)) {
      const flag = h.best.ownDomain ? 'own-domain' : 'OFF-DOMAIN';
      console.log(
        `  ${h.best.address.padEnd(34)} ${flag.padEnd(11)} ${h.best.source.padEnd(7)} ${h.lead.name}`,
      );
    }
    if (hits.length > 15) console.log(`  … and ${hits.length - 15} more`);
    console.log('\n  no address found:');
    for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${reason}`);
    }
  }

  if (!o.apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    console.log('This script only collects; sending still routes through lib/outreach/guard.mjs.');
    return;
  }

  let wrote = 0;
  const failures = [];
  for (const h of hits) {
    const { error } = await sb.from('leads').update({ email: h.best.address }).eq('id', h.lead.id);
    if (error) failures.push(`${h.lead.id}: ${error.message || error}`);
    else wrote++;
  }
  console.log(`\nWrote email on ${wrote} of ${hits.length} lead(s).`);
  if (failures.length) {
    console.error(`${failures.length} write(s) failed:`);
    for (const f of failures.slice(0, 10)) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
