/**
 * sweepPresets — browser-side helpers over the Outscraper query presets.
 *
 * The preset DATA (PRESETS / PRESET_NAMES) lives in ONE place —
 * `scripts/lib/query-presets.mjs` — and is imported here unmodified so the
 * Node script (scripts/outscraper-fetch.mjs) and this browser bundle can
 * never drift apart. That file is pure data + plain ESM (no Node-only APIs:
 * no `fs`/`path`/`process`), so Vite bundles it into the client fine even
 * though it lives outside `src/`.
 *
 * This module adds UI-only logic that the Node side has no use for: pair
 * expansion (niche × metro, kept separate rather than flattened into
 * `"<keyword> in <area>"` text — `/api/pull-leads` wants `{niche, metro}`
 * as distinct fields, see api/pull-leads.ts), a bounded/spread-out default
 * sample (so selecting a preset never pre-selects all ~100 pairs), and a
 * record-count estimate. Spend-safety context: docs/prospecting/compliance.md
 * + the Outscraper-spend-on-hold standing rule (Adrian, 2026-07-07) — this
 * file only ever computes numbers and pair lists; it never calls the API.
 */
import {
  PRESETS as RAW_PRESETS,
  PRESET_NAMES as RAW_PRESET_NAMES,
} from '../../../../../scripts/lib/query-presets.mjs';

/** Mirrors the `Preset` JSDoc typedef in scripts/lib/query-presets.mjs (plain
 *  JS has no type export Node/TS can share, so the shape is declared once
 *  here for the browser side — the DATA itself is still imported, never
 *  copied, so the two can't drift on content). */
export interface Preset {
  label: string;
  keywords: string[];
  metros: { region: string; areas: string[] }[];
}

export const PRESETS: Record<string, Preset> = RAW_PRESETS;
export const PRESET_NAMES: readonly string[] = RAW_PRESET_NAMES;

/** One niche×metro pair — maps 1:1 onto a `/api/pull-leads` request body (+ count). */
export interface SweepPair {
  niche: string; // keyword, e.g. "fence company" — POSTed as `niche`
  metro: string; // area, e.g. "Seattle, WA" — POSTed as `metro`
}

/** Stable identity for a pair — used as the checklist selection key. */
export function pairKey(pair: SweepPair): string {
  return `${pair.niche}␟${pair.metro}`;
}

/**
 * Expand a preset into its full niche×metro pair list (area × keyword,
 * matching scripts/lib/query-presets.mjs's `buildQueries` iteration order,
 * but kept as structured pairs instead of a flattened query string).
 */
export function expandPresetPairs(presetName: string): SweepPair[] {
  const preset = PRESETS[presetName];
  if (!preset) return [];
  const pairs: SweepPair[] = [];
  for (const metro of preset.metros) {
    for (const area of metro.areas) {
      for (const keyword of preset.keywords) {
        pairs.push({ niche: keyword, metro: area });
      }
    }
  }
  return pairs;
}

/** Total records an Outscraper run would source: one `count` per selected pair. */
export function estimateRecords(selectedPairCount: number, countPerPair: number): number {
  return selectedPairCount * countPerPair;
}

/**
 * Bounded default selection: instead of pre-checking all ~100+ pairs (a
 * one-click budget-burner), spread a handful evenly across the full list —
 * covering multiple metros/keywords rather than clustering on the first
 * region — sized so `selection.length * countPerPair` lands at/under `cap`.
 */
export function sampleBounded(pairs: SweepPair[], cap: number, countPerPair: number): SweepPair[] {
  if (pairs.length === 0 || countPerPair <= 0) return [];
  const maxPairs = Math.max(1, Math.min(pairs.length, Math.floor(cap / countPerPair)));
  if (maxPairs >= pairs.length) return [...pairs];
  const step = pairs.length / maxPairs;
  const indices = new Set<number>();
  for (let i = 0; i < maxPairs; i++) {
    indices.add(Math.min(pairs.length - 1, Math.round(i * step)));
  }
  return [...indices].sort((a, b) => a - b).map((i) => pairs[i]);
}
