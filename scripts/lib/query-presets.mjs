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

/** @type {Record<string, Preset>} */
export const PRESETS = {
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
          'Seattle, WA', 'Bellevue, WA', 'Redmond, WA', 'Kirkland, WA', 'Renton, WA',
          'Everett, WA', 'Kent, WA', 'Federal Way, WA', 'Shoreline, WA', 'Bothell, WA',
        ],
      },
      { region: 'Tacoma, WA', areas: ['Tacoma, WA', 'Lakewood, WA', 'Puyallup, WA', 'University Place, WA'] },
      { region: 'Spokane, WA', areas: ['Spokane, WA', 'Spokane Valley, WA'] },
      { region: 'Vancouver, WA', areas: ['Vancouver, WA', 'Camas, WA'] },
      { region: 'Olympia, WA', areas: ['Olympia, WA', 'Lacey, WA'] },
      { region: 'Bellingham, WA', areas: ['Bellingham, WA'] },
      {
        region: 'Portland, OR',
        areas: [
          'Portland, OR', 'Beaverton, OR', 'Hillsboro, OR', 'Gresham, OR',
          'Tigard, OR', 'Lake Oswego, OR', 'Oregon City, OR', 'Milwaukie, OR',
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
