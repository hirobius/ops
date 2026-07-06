#!/usr/bin/env node
/**
 * scripts/export-agent-lead.mjs
 *
 * The ops → clients handoff for the "prospect → Astro site" bridge (Phase 3).
 * Reads a saved prospecting batch (the `--json` output of outscraper-fetch.mjs, or
 * a batch.json), picks one scored prospect, and emits a `lead.json` the clients
 * repo's site generator consumes:
 *
 *   ops (scrape+score)  →  export-agent-lead.mjs  →  lead.json  →  clients/scripts/prospect-to-site.ts
 *
 * The emitted file is a superset of the clients agent's `LeadSchema` input
 * (name, category, city, region, phone?, email?, website?, rating?, reviewCount?,
 * notes?) PLUS two side blocks the clients bridge uses but the LLM does not:
 *   _facts  — real scraped facts to OVERLAY onto the generated config (never
 *             fabricated): address, postalCode, hours, businessStatus, scores.
 *   _media  — image URLs to download+optimize into the site: heroPhotoUrl, logoUrl.
 *
 * Scraped records are unverified PII — treat lead.json like prospects/ (gitignored).
 *
 * USAGE:
 *   node scripts/export-agent-lead.mjs --batch <batch.json> --slug <slug> [--out lead.json]
 *   node scripts/export-agent-lead.mjs --batch <batch.json> --index 0
 *   node scripts/export-agent-lead.mjs --batch <batch.json> --top        # highest leadScore
 */

import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const opts = { batch: null, slug: null, index: null, top: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--batch': opts.batch = next(); break;
      case '--slug': opts.slug = next(); break;
      case '--index': opts.index = Number(next()); break;
      case '--top': opts.top = true; break;
      case '--out': opts.out = next(); break;
      case '--help': case '-h': opts.help = true; break;
      default: console.error(`Unknown flag: ${a}`); opts.help = true;
    }
  }
  return opts;
}

/** A prospect's rich scraped context → a `notes` string the generator reads for
 *  accurate, non-fabricated copy. Facts only; the LLM writes the marketing prose. */
function buildNotes(p) {
  const c = p.content ?? {};
  const parts = [];
  if (c.description) parts.push(`Google Business Profile description: ${c.description}`);
  if (p.reviews) parts.push(`${p.reviews} Google reviews${p.rating != null ? ` averaging ${p.rating}★` : ''}`);
  const types = Array.isArray(c.types) && c.types.length ? c.types.join(', ') : p.category;
  if (types) parts.push(`Categories: ${types}`);
  const loc = [p.city, p.region].filter(Boolean).join(', ');
  if (loc) parts.push(`Located in ${loc}`);
  parts.push(
    `Current web presence: ${p.signals?.sitePresence ?? 'unknown'}` +
      (p.website ? ` (${p.website})` : ' (none found)'),
  );
  return parts.join('. ') + '.';
}

/** Prospect → handoff lead.json object. */
export function prospectToAgentLead(p) {
  const c = p.content ?? {};
  const s = p.signals ?? {};
  return {
    // clients LeadSchema fields (the LLM's input)
    name: p.name || '',
    category: p.category || 'local service business',
    city: p.city || '',
    region: p.region || '',
    phone: p.phone || undefined,
    email: c.email || undefined,
    website: p.website || undefined,
    rating: p.rating ?? undefined,
    reviewCount: p.reviews ?? undefined,
    notes: buildNotes(p),
    // side blocks — used by the clients bridge, NOT the LLM
    _facts: {
      slug: p.slug || null,
      placeId: p.placeId || null,
      address: p.address || null,
      postalCode: c.postalCode || null,
      hours: c.hours ?? null,
      businessStatus: c.businessStatus || null,
      leadScore: s.leadScore ?? null,
      buildScore: s.buildScore ?? null,
      sitePresence: s.sitePresence ?? null,
    },
    _media: {
      heroPhotoUrl: Array.isArray(c.photos) && c.photos.length ? c.photos[0] : null,
      logoUrl: c.logoUrl || null,
    },
  };
}

function loadProspects(batchPath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(batchPath), 'utf8'));
  const prospects = Array.isArray(raw?.prospects) ? raw.prospects : Array.isArray(raw) ? raw : [];
  if (!prospects.length) {
    throw new Error(`No prospects in ${batchPath} (expected a { prospects: [...] } batch/summary).`);
  }
  return prospects;
}

function pickProspect(prospects, opts) {
  if (opts.slug) {
    const hit = prospects.find((p) => p.slug === opts.slug);
    if (!hit) throw new Error(`No prospect with slug "${opts.slug}" in the batch.`);
    return hit;
  }
  if (opts.index != null) {
    const hit = prospects[opts.index];
    if (!hit) throw new Error(`Index ${opts.index} out of range (0..${prospects.length - 1}).`);
    return hit;
  }
  // --top (or default): highest leadScore
  return [...prospects].sort((a, b) => (b.signals?.leadScore ?? 0) - (a.signals?.leadScore ?? 0))[0];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.batch) {
    console.log(
      'Usage: node scripts/export-agent-lead.mjs --batch <batch.json> [--slug <slug> | --index <n> | --top] [--out lead.json]',
    );
    process.exit(opts.help ? 0 : 1);
  }
  const prospects = loadProspects(opts.batch);
  const prospect = pickProspect(prospects, opts);
  const lead = prospectToAgentLead(prospect);
  const outPath = path.resolve(opts.out || `lead-${lead._facts.slug || 'prospect'}.json`);
  fs.writeFileSync(outPath, JSON.stringify(lead, null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`  ${lead.name} — ${lead.city}, ${lead.region}  ·  need ${lead._facts.leadScore}/build ${lead._facts.buildScore}`);
  console.log(`  hero photo: ${lead._media.heroPhotoUrl ? 'yes' : 'none'}  ·  logo: ${lead._media.logoUrl ? 'yes' : 'none'}`);
  console.log(`\nNext (clients repo):  pnpm tsx scripts/prospect-to-site.ts --lead ${path.basename(outPath)}`);
}

// Only run main() when invoked as a CLI (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) main();
