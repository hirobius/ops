/**
 * scripts/lib/query-presets.mjs
 *
 * Named query matrices for the Outscraper pipeline. These are the *query
 * definitions only* — the "what/where to search" — ported from hirobius/clients
 * `scripts/lead-gen/config.ts` per docs/OPS-HANDOFF.md Part A (the self-built
 * scraper is retired; only METROS + KEYWORDS carry over). Overlap between
 * keywords/areas is fine — results dedupe by Google place id downstream.
 *
 * A preset expands to one text query per (area × keyword): `${keyword} in ${area}`.
 * Pass `--preset <name>` to scripts/outscraper-fetch.mjs to run the whole matrix.
 */

/** @typedef {{ label: string, keywords: string[], metros: { region: string, areas: string[] }[] }} Preset */

// WA-only metro set (the WA slice of the exterior-cleaning matrix, no OR) —
// shared by the niche presets below so "WA for now" is one edit, not five.
/** @type {{ region: string, areas: string[] }[]} */
const WA_METROS = [
  {
    region: 'Seattle, WA',
    areas: [
      'Seattle, WA',
      'Bellevue, WA',
      'Redmond, WA',
      'Kirkland, WA',
      'Renton, WA',
      'Everett, WA',
      'Kent, WA',
      'Federal Way, WA',
      'Shoreline, WA',
      'Bothell, WA',
    ],
  },
  {
    region: 'Tacoma, WA',
    areas: ['Tacoma, WA', 'Lakewood, WA', 'Puyallup, WA', 'University Place, WA'],
  },
  { region: 'Spokane, WA', areas: ['Spokane, WA', 'Spokane Valley, WA'] },
  { region: 'Vancouver, WA', areas: ['Vancouver, WA', 'Camas, WA'] },
  { region: 'Olympia, WA', areas: ['Olympia, WA', 'Lacey, WA'] },
  { region: 'Bellingham, WA', areas: ['Bellingham, WA'] },
];

// ── HOME MARKET: Spokane + North Idaho (added 2026-09-16) ────────────────────
//
// WA_METROS above carries Spokane as just two areas ('Spokane, WA',
// 'Spokane Valley, WA') and NO Idaho at all — so until now the preset matrix
// could not scrape Adrian's own metro properly, and could not reach Coeur
// d'Alene / Post Falls at all. That is the market he lives in, has referrals
// in, and already has a portfolio piece in (the North Idaho forestry-mulching
// / land-clearing rebuild).
//
// DELIBERATELY A SEPARATE CONSTANT, not an edit to WA_METROS. Every existing
// preset expands over WA_METROS, so widening it would silently multiply the
// Outscraper bill for all fourteen of them at once (and break the 21-area
// count the tests pin). Home-market presets opt in here instead.
/** @type {{ region: string, areas: string[] }[]} */
const INLAND_NW_METROS = [
  {
    region: 'Spokane, WA',
    areas: [
      'Spokane, WA',
      'Spokane Valley, WA',
      'Liberty Lake, WA',
      'Cheney, WA',
      'Airway Heights, WA',
      'Deer Park, WA',
      'Medical Lake, WA',
    ],
  },
  // Kootenai County + the Sandpoint corridor. State lines do not matter to a
  // web build; a 35-minute drive from Spokane is the same service area.
  {
    region: "Coeur d'Alene, ID",
    areas: [
      "Coeur d'Alene, ID",
      'Post Falls, ID',
      'Hayden, ID',
      'Rathdrum, ID',
      'Kootenai County, ID',
    ],
  },
  { region: 'Sandpoint, ID', areas: ['Sandpoint, ID', 'Priest River, ID', 'Ponderay, ID'] },
];

/** @type {Record<string, Preset>} */
export const PRESETS = {
  // ── HOME MARKET (added 2026-09-16) — Spokane + North Idaho ────────────────
  //
  // These exist because the nearest lead is the cheapest lead: same time zone,
  // a drivable meeting, and a local portfolio piece to point at. Both expand
  // over INLAND_NW_METROS, so they reach Idaho where nothing else here does.
  //
  // The lead source these presets DO NOT cover is new business registrations
  // (WA CCFS, Idaho SOSBiz, L&I / DOPL contractor licences). A business
  // registered last month has no website, no incumbent agency and no Google
  // Maps reviews yet — so Outscraper cannot see it at all, and our review-weighted
  // scorer would rank it last if it could. That is a separate intake, not a preset.
  //
  // Adrian rebuilt a North Idaho forestry-mulching / land-clearing site, so this
  // is the one niche where the cold email can say "here is the same thing I built
  // for a business like yours, down the road." Proof beats copy; lead with it.
  'forestry-mulching-inw': {
    label: 'Forestry mulching / land clearing — Spokane + North Idaho (portfolio proof)',
    keywords: [
      'forestry mulching',
      'land clearing',
      'brush clearing',
      'lot clearing',
      'defensible space',
    ],
    metros: INLAND_NW_METROS,
  },
  // A cross-trade sweep of the home market. Keywords are the high-ticket,
  // low-penetration trades only.
  //
  // HVAC, plumbing and roofing are DELIBERATELY ABSENT despite appearing on
  // most "best niches" lists. niche-targeting.md rules them out and the reason
  // still holds: they are not low-penetration (they have sites, just bad ones)
  // and they are the most agency-saturated vertical there is. They belong to
  // the audit-led redesign play, not to a "you have no website" cold email.
  'home-market-inw': {
    label: 'Home-market trades sweep — Spokane + North Idaho',
    keywords: [
      'excavation contractor',
      'tree service',
      'septic service',
      'fence contractor',
      'concrete contractor',
      'landscaping',
      'towing',
      'auto repair',
    ],
    metros: INLAND_NW_METROS,
  },

  // ── WA niche beachheads — trades with low website-penetration + high job
  //    ticket + reachable by cold outreach (see docs/prospecting/niche-targeting.md).
  'fencing-wa': {
    label: 'Fencing & deck builders — WA metros',
    keywords: [
      'fence company',
      'fence installation',
      'fence contractor',
      'deck builder',
      'deck contractor',
    ],
    metros: WA_METROS,
  },
  'tree-service-wa': {
    label: 'Tree services / arborists — WA metros',
    keywords: ['tree service', 'tree removal', 'arborist', 'stump grinding', 'tree trimming'],
    metros: WA_METROS,
  },
  'septic-wa': {
    label: 'Septic & excavation — WA metros',
    keywords: [
      'septic service',
      'septic pumping',
      'septic installation',
      'excavation contractor',
      'land clearing',
    ],
    metros: WA_METROS,
  },
  'pressure-washing-wa': {
    label: 'Pressure / soft washing — WA metros',
    keywords: ['pressure washing', 'soft washing', 'house washing', 'roof cleaning'],
    metros: WA_METROS,
  },
  'concrete-coating-wa': {
    label: 'Concrete / epoxy floor coating — WA metros',
    keywords: [
      'epoxy flooring',
      'garage floor coating',
      'concrete coating',
      'concrete resurfacing',
    ],
    metros: WA_METROS,
  },

  // ── Underserved trades (added 2026-07-07 after Run 01) — higher-ticket,
  //    less-digitized, nobody pitching them; excavation clustered in Run 01. ──
  'excavation-wa': {
    label: 'Excavation / land clearing / grading — WA metros',
    keywords: [
      'excavation contractor',
      'land clearing',
      'grading contractor',
      'site prep',
      'demolition contractor',
    ],
    metros: WA_METROS,
  },
  'welding-wa': {
    label: 'Welding / metal fabrication — WA metros',
    keywords: ['welding', 'metal fabrication', 'welder', 'custom fabrication', 'mobile welding'],
    metros: WA_METROS,
  },
  'well-drilling-wa': {
    label: 'Well drilling / water systems — WA metros',
    keywords: [
      'well drilling',
      'water well drilling',
      'well pump service',
      'water well',
      'water systems',
    ],
    metros: WA_METROS,
  },
  'masonry-wa': {
    label: 'Masonry / hardscaping — WA metros',
    keywords: ['masonry', 'hardscaping', 'retaining walls', 'paver patio', 'stone mason'],
    metros: WA_METROS,
  },

  // ── HIGH-TICKET PROFESSIONAL SERVICES (added 2026-09-16) ──────────────────
  //
  // A DIFFERENT PLAY from the trades presets above, and deliberately so.
  // niche-targeting.md's original shortlist optimised for the CHEAPEST CLOSE:
  // low website penetration, so the pitch is "you have no site" and the product
  // is one templated page. These niches optimise for CLIENT BUDGET instead —
  // $4k–$18k builds plus monthly retainers, against ~100% website penetration.
  //
  // THE PITCH IS THEREFORE NOT THE SAME PITCH. Nobody here needs a website; they
  // need a better one, and they will only believe that with evidence. Every lead
  // in these presets is a `custom` presence, which scores 4 + 30 + 10 + 15 = 59
  // against QUALIFIED_LEAD_SCORE 60 until scripts/audit-sites.mjs writes a real
  // site_quality_score. That is not a bug to route around — it is the scorer
  // refusing to email someone we have not looked at. Audit first, then outreach.
  //
  // WHAT THIS COSTS, honestly: these verticals are the most agency-saturated in
  // local marketing, the decision-maker sits behind an office manager, and the
  // cycle is weeks not days. The trades presets remain the faster close.
  'law-wa': {
    label: 'Contingency & retainer law firms — WA metros (high-ticket)',
    keywords: [
      'personal injury lawyer',
      'car accident attorney',
      'family law attorney',
      'divorce lawyer',
      'criminal defense attorney',
      'estate planning attorney',
    ],
    metros: WA_METROS,
  },
  'dental-wa': {
    label: 'Elective / cosmetic dental — WA metros (high-ticket)',
    keywords: [
      'cosmetic dentist',
      'dental implants',
      'orthodontist',
      'invisalign dentist',
      'periodontist',
      'oral surgeon',
    ],
    metros: WA_METROS,
  },
  // Cash-pay and elective specialists: the patient chooses the practice, so the
  // website is the storefront rather than an insurance formulary entry.
  'medical-specialist-wa': {
    label: 'Elective medical specialists — WA metros (high-ticket)',
    keywords: [
      'dermatologist',
      'plastic surgeon',
      'med spa',
      'fertility clinic',
      'vein clinic',
      'lasik surgeon',
    ],
    metros: WA_METROS,
  },
  'financial-advisor-wa': {
    label: 'Financial advisors / wealth management — WA metros (high-ticket)',
    keywords: [
      'financial advisor',
      'wealth management',
      'retirement planning',
      'investment advisor',
      'certified financial planner',
    ],
    metros: WA_METROS,
  },
  // The one high-ticket niche that sits in BOTH theses: a real trade, an owner
  // who answers the phone, AND a six-figure job ticket. Screen out the volume
  // production builders — their sites are corporate and not ours to replace.
  'custom-home-builder-wa': {
    label: 'Custom home builders & design-build remodelers — WA metros',
    keywords: [
      'custom home builder',
      'home builder',
      'design build remodeler',
      'luxury home builder',
      'whole home remodel',
    ],
    metros: WA_METROS,
  },

  // Beachhead: exterior cleaning across the WA+OR core metros + suburbs.
  'exterior-cleaning': {
    label: 'Exterior cleaning — WA+OR core metros (beachhead)',
    keywords: [
      'pressure washing',
      'power washing',
      'soft washing',
      'roof cleaning',
      'moss removal',
      'gutter cleaning',
      'exterior house cleaning',
    ],
    metros: [
      {
        region: 'Seattle, WA',
        areas: [
          'Seattle, WA',
          'Bellevue, WA',
          'Redmond, WA',
          'Kirkland, WA',
          'Renton, WA',
          'Everett, WA',
          'Kent, WA',
          'Federal Way, WA',
          'Shoreline, WA',
          'Bothell, WA',
        ],
      },
      {
        region: 'Tacoma, WA',
        areas: ['Tacoma, WA', 'Lakewood, WA', 'Puyallup, WA', 'University Place, WA'],
      },
      { region: 'Spokane, WA', areas: ['Spokane, WA', 'Spokane Valley, WA'] },
      { region: 'Vancouver, WA', areas: ['Vancouver, WA', 'Camas, WA'] },
      { region: 'Olympia, WA', areas: ['Olympia, WA', 'Lacey, WA'] },
      { region: 'Bellingham, WA', areas: ['Bellingham, WA'] },
      {
        region: 'Portland, OR',
        areas: [
          'Portland, OR',
          'Beaverton, OR',
          'Hillsboro, OR',
          'Gresham, OR',
          'Tigard, OR',
          'Lake Oswego, OR',
          'Oregon City, OR',
          'Milwaukie, OR',
        ],
      },
      { region: 'Salem, OR', areas: ['Salem, OR', 'Keizer, OR'] },
      { region: 'Eugene, OR', areas: ['Eugene, OR', 'Springfield, OR'] },
      { region: 'Bend, OR', areas: ['Bend, OR', 'Redmond, OR'] },
      { region: 'Medford, OR', areas: ['Medford, OR', 'Ashland, OR'] },
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/** Expand a preset into a flat list of `${keyword} in ${area}` text queries. */
export function buildQueries(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset "${presetName}". Known: ${PRESET_NAMES.join(', ')}`);
  }
  const out = [];
  for (const metro of preset.metros) {
    for (const area of metro.areas) {
      for (const keyword of preset.keywords) {
        out.push(`${keyword} in ${area}`);
      }
    }
  }
  return out;
}
